const { ChannelType, PermissionsBitField } = require('discord.js');
const { dbQueries } = require('../database/db');
const config = require('../../config.json');

const voiceHandler = {
  /**
   * Creates or sets up the designated Support Voice Channels:
   * - 🔊 Support Waiting Room (Publicly visible, auto-muted for members)
   * - 🔊 Support Room 1 & 2 (HIDDEN from members, only Admins see & drag into them)
   */
  setupSupportVoiceChannels: async (guild) => {
    try {
      const settings = dbQueries.getGuildSettings(guild.id) || {};
      let ticketCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === config.categories.tickets.toLowerCase()
      );

      if (!ticketCategory) {
        ticketCategory = await guild.channels.create({
          name: config.categories.tickets,
          type: ChannelType.GuildCategory
        });
      }

      // Find Admin/Staff roles
      const adminRole = settings.admin_role_id
        ? guild.roles.cache.get(settings.admin_role_id)
        : guild.roles.cache.find(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase());

      // Overwrites for PUBLIC Waiting Room (Visible to all, Speak disabled for members)
      const waitingRoomOverwrites = [
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect
          ],
          deny: [
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.Stream,
            PermissionsBitField.Flags.UseSoundboard,
            PermissionsBitField.Flags.UseEmbeddedActivities
          ]
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.MuteMembers,
            PermissionsBitField.Flags.DeafenMembers,
            PermissionsBitField.Flags.MoveMembers,
            PermissionsBitField.Flags.ManageChannels
          ]
        }
      ];

      // Overwrites for PRIVATE Support Room 1 & 2 (Hidden from everyone, only Admins see/join & drag)
      const privateRoomOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect
          ]
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.MuteMembers,
            PermissionsBitField.Flags.DeafenMembers,
            PermissionsBitField.Flags.MoveMembers,
            PermissionsBitField.Flags.ManageChannels
          ]
        }
      ];

      if (adminRole) {
        waitingRoomOverwrites.push({
          id: adminRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.MuteMembers,
            PermissionsBitField.Flags.DeafenMembers,
            PermissionsBitField.Flags.MoveMembers,
            PermissionsBitField.Flags.PrioritySpeaker
          ]
        });

        privateRoomOverwrites.push({
          id: adminRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.MuteMembers,
            PermissionsBitField.Flags.DeafenMembers,
            PermissionsBitField.Flags.MoveMembers,
            PermissionsBitField.Flags.PrioritySpeaker
          ]
        });
      }

      // Room definitions
      const roomDefinitions = [
        { name: '🔊 Support Waiting Room', userLimit: 0, overwrites: waitingRoomOverwrites },
        { name: '🔊 Support Room 1', userLimit: 3, overwrites: privateRoomOverwrites },
        { name: '🔊 Support Room 2', userLimit: 3, overwrites: privateRoomOverwrites }
      ];

      const createdRooms = [];

      for (const def of roomDefinitions) {
        let channel = guild.channels.cache.find(
          c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === def.name.toLowerCase()
        );

        if (!channel) {
          channel = await guild.channels.create({
            name: def.name,
            type: ChannelType.GuildVoice,
            parent: ticketCategory.id,
            userLimit: def.userLimit,
            permissionOverwrites: def.overwrites
          });
        } else {
          await channel.permissionOverwrites.set(def.overwrites);
        }
        createdRooms.push(channel);
      }

      // Save primary waiting room ID to database
      dbQueries.updateGuildSettings(guild.id, { support_voice_id: createdRooms[0].id });

      return { success: true, channels: createdRooms };
    } catch (err) {
      console.error('[VoiceManager] Error setting up support voice channels:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Checks if a channel is a support voice channel
   */
  isSupportVoiceChannel: (channel) => {
    if (!channel || channel.type !== ChannelType.GuildVoice) return false;
    const name = channel.name.toLowerCase();
    return name.includes('support') || name.includes('waiting room') || name.includes('help');
  },

  /**
   * Handles user entering or leaving any support voice channel.
   * Auto-mutes non-admin users in the waiting room.
   */
  handleVoiceStateUpdate: async (oldState, newState) => {
    const guild = newState.guild;
    const newChannel = newState.channel;
    const oldChannel = oldState.channel;

    const isEnteringSupport = voiceHandler.isSupportVoiceChannel(newChannel);
    const wasInSupport = voiceHandler.isSupportVoiceChannel(oldChannel);

    // User joined or moved into a Support Voice Channel
    if (isEnteringSupport && (!wasInSupport || oldChannel.id !== newChannel.id)) {
      const member = newState.member;
      if (!member || member.user.bot) return;

      const settings = dbQueries.getGuildSettings(guild.id) || {};
      const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.roles.cache.some(r =>
          r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
          r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
          (settings.admin_role_id && r.id === settings.admin_role_id)
        );

      // In Waiting room: auto-mute non-admins
      if (newChannel.name.toLowerCase().includes('waiting') && !isAdmin) {
        try {
          if (!newState.serverMute) {
            await member.voice.setMute(true, 'Support Waiting Room: Auto-muted on entry. Admin will drag or unmute.');
            console.log(`[VoiceManager] Auto-muted non-admin ${member.user.tag} in ${newChannel.name}.`);
          }
        } catch (err) {
          console.error(`[VoiceManager] Could not server-mute ${member.user.tag}:`, err);
        }
      }

      // If an Admin dragged a user into Support Room 1 or 2, grant them speaking access in that private room
      if ((newChannel.name.toLowerCase().includes('room 1') || newChannel.name.toLowerCase().includes('room 2')) && !isAdmin) {
        try {
          if (newState.serverMute) {
            await member.voice.setMute(false, 'Moved into private support room: unmuted for session');
          }
          await newChannel.permissionOverwrites.edit(member.id, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            UseVAD: true
          });
        } catch (err) {
          console.error(`[VoiceManager] Error granting speak perms to moved member ${member.user.tag}:`, err);
        }
      }
    }

    // User left private support room -> Reset permission overwrite
    if (wasInSupport && (!isEnteringSupport || oldChannel.id !== newChannel.id)) {
      const member = oldState.member;
      if (member && oldChannel && (oldChannel.name.toLowerCase().includes('room 1') || oldChannel.name.toLowerCase().includes('room 2'))) {
        try {
          await oldChannel.permissionOverwrites.delete(member.id, 'User left private support room').catch(() => null);
        } catch {
          // Ignore
        }
      }
    }
  },

  /**
   * Unmutes a specific user in their connected support voice room (Admin only).
   */
  unmuteUserInVoice: async (guild, targetMember, adminMember) => {
    try {
      const userVoiceChannel = targetMember.voice.channel;

      if (!userVoiceChannel || !voiceHandler.isSupportVoiceChannel(userVoiceChannel)) {
        return {
          success: false,
          message: `<@${targetMember.id}> is not currently connected to any Support Voice Room.`
        };
      }

      // Grant Speak permission override on the specific room they are currently in
      await userVoiceChannel.permissionOverwrites.edit(targetMember.id, {
        Speak: true,
        UseVoiceActivity: true
      });

      // Unmute server-mute
      if (targetMember.voice.serverMute) {
        await targetMember.voice.setMute(false, `Unmuted by Admin ${adminMember.user.tag}`);
      }

      return {
        success: true,
        message: `🎙️ <@${targetMember.id}> has been unmuted in <#${userVoiceChannel.id}> by <@${adminMember.id}>.`
      };
    } catch (err) {
      console.error(`[VoiceManager] Error unmuting ${targetMember.id}:`, err);
      return { success: false, message: `Failed to unmute: ${err.message}` };
    }
  },

  /**
   * Mutes a specific user in voice room.
   */
  muteUserInVoice: async (guild, targetMember, adminMember) => {
    try {
      const userVoiceChannel = targetMember.voice.channel;
      if (userVoiceChannel) {
        await userVoiceChannel.permissionOverwrites.delete(targetMember.id).catch(() => null);
        await targetMember.voice.setMute(true, `Muted by Admin ${adminMember.user.tag}`).catch(() => null);
      }
      return { success: true, message: `🔇 <@${targetMember.id}> has been muted in voice.` };
    } catch (err) {
      return { success: false, message: `Failed to mute: ${err.message}` };
    }
  }
};

module.exports = voiceHandler;
