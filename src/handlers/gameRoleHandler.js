const { ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const embedBuilder = require('../utils/embedBuilder');

const gameRoleHandler = {
  /**
   * Deletes deprecated game roles and old channels that are no longer part of the 4 core games.
   */
  cleanupOldGameHubsAndRoles: async (guild) => {
    try {
      await guild.roles.fetch().catch(() => null);
      await guild.channels.fetch().catch(() => null);

      const activeRoleNames = config.gameRoles.map(g => g.name.toLowerCase());
      const deprecatedRoleNames = ['bgmi mobile', 'bgmi pc', 'cod warzone', 'call of duty: warzone', 'free fire max'];

      // 1. Delete deprecated game roles
      for (const role of guild.roles.cache.values()) {
        if (deprecatedRoleNames.includes(role.name.toLowerCase())) {
          console.log(`[GameRoleManager] Deleting old role: ${role.name}`);
          await role.delete('Cleaning up deprecated game roles').catch(err => {
            console.warn(`[GameRoleManager] Could not delete role ${role.name}:`, err.message);
          });
        }
      }

      // 2. Delete deprecated channels
      const deprecatedChannelNames = [
        'bgmi-mobile', '📱-bgmi-mobile', 'bgmi-pc', '💻-bgmi-pc', 'cod-warzone', '🎯-cod-warzone',
        'bgmi mobile squad', '🔊 bgmi mobile squad', 'bgmi pc squad', '🔊 bgmi pc squad', 'warzone squad', '🔊 warzone squad'
      ];

      for (const channel of guild.channels.cache.values()) {
        const cleanName = channel.name.toLowerCase();
        if (deprecatedChannelNames.some(d => cleanName === d || cleanName.includes('bgmi') || cleanName.includes('warzone'))) {
          console.log(`[GameRoleManager] Deleting deprecated game channel: ${channel.name}`);
          await channel.delete('Cleaning up deprecated game channels').catch(() => null);
        }
      }
    } catch (err) {
      console.error('[GameRoleManager] Error during cleanup:', err.message);
    }
  },

  /**
   * Ensures all 4 core game roles exist in the guild.
   */
  ensureGameRoles: async (guild) => {
    await guild.roles.fetch().catch(() => null);
    const roleMap = new Map(); // key -> Role object

    for (const gameDef of config.gameRoles) {
      let role = guild.roles.cache.find(r => r.name.toLowerCase() === gameDef.name.toLowerCase());
      if (!role) {
        try {
          role = await guild.roles.create({
            name: gameDef.name,
            color: gameDef.color || '#5865F2',
            reason: `Auto-created game role for ${gameDef.name}`,
            permissions: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak
            ]
          });
          console.log(`[GameRoleManager] Created role: ${role.name}`);
        } catch (err) {
          console.error(`[GameRoleManager] Failed to create role ${gameDef.name}:`, err.message);
        }
      }
      if (role) {
        roleMap.set(gameDef.key, role);
      }
    }

    return roleMap;
  },

  /**
   * Creates individual dedicated categories and role-locked channels for each of the 4 core games:
   * 1. ⚽ Efootball ⚽ -> #⚽-efootball & 🔊 eFootball Lounge
   * 2. 🔥 Valorant 🔥 -> #🔥-valorant & 🔊 Valorant Team
   * 3. free fire -> #🔫-free-fire & 🔊 Free Fire Squad
   * 4. Pubg mobile -> #📱-pubg-mobile & 🔊 PUBG Mobile Squad
   */
  setupGameHubs: async (guild) => {
    try {
      // 1. Clean up old game roles & deprecated channels first
      await gameRoleHandler.cleanupOldGameHubsAndRoles(guild);

      // 2. Ensure 4 core game roles exist
      const roleMap = await gameRoleHandler.ensureGameRoles(guild);

      // 3. Find Admin role
      const adminRole = guild.roles.cache.find(
        r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase()
      );

      // 4. Remove old generic "🎮 GAME HUBS" category if empty or migrate it
      const oldHubCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('game hub')
      );

      const createdCategories = [];
      const createdChannels = [];

      // 5. Create an individual Category and private channels for each of the 4 games
      for (const gameDef of config.gameRoles) {
        const gameRole = roleMap.get(gameDef.key);
        if (!gameRole) continue;

        const categoryName = gameDef.categoryName || `${gameDef.emoji} ${gameDef.name} ${gameDef.emoji}`;

        // Category Overwrites: Role-locked to players with this game's role + Admins
        const catOverwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect
            ]
          },
          {
            id: gameRole.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.AddReactions
            ]
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak
            ]
          }
        ];

        if (adminRole) {
          catOverwrites.push({
            id: adminRole.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak
            ]
          });
        }

        // Find or create this game's Category
        let category = guild.channels.cache.find(
          c => c.type === ChannelType.GuildCategory && (
            c.name.toLowerCase() === categoryName.toLowerCase() ||
            c.name.toLowerCase().includes(gameDef.key.replace('_', ' ')) ||
            c.name.toLowerCase().includes(gameDef.name.toLowerCase())
          )
        );

        if (!category) {
          category = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            permissionOverwrites: catOverwrites
          });
        } else {
          await category.setName(categoryName).catch(() => null);
          await category.permissionOverwrites.set(catOverwrites).catch(() => null);
        }
        createdCategories.push(category);

        // Read-only permissions for announcement & scoreboard
        const readOnlyOverwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages
            ]
          },
          {
            id: gameRole.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.AddReactions
            ],
            deny: [
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.CreatePublicThreads,
              PermissionsBitField.Flags.CreatePrivateThreads,
              PermissionsBitField.Flags.SendMessagesInThreads
            ]
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles
            ]
          }
        ];
        if (adminRole) {
          readOnlyOverwrites.push({
            id: adminRole.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles
            ]
          });
        }

        // 1. Tournament Registration Channel for this category
        const regChannelName = gameDef.registrationChannel || `📝-${gameDef.key.replace('_', '-')}-registration`;
        let regChannel = guild.channels.cache.find(
          c => c.type === ChannelType.GuildText && (
            c.name === regChannelName ||
            (c.parentId === category.id && (c.name.includes('registration') || c.name.includes('📝')))
          )
        );

        if (!regChannel) {
          regChannel = await guild.channels.create({
            name: regChannelName,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Official Tournament Registration Desk & Live Slot Balance for ${gameDef.name}`,
            permissionOverwrites: readOnlyOverwrites
          });

          const regEmbed = new EmbedBuilder()
            .setColor(gameDef.color || '#5865F2')
            .setTitle(`📝 ${gameDef.name} — Tournament Registration Desk`)
            .setDescription(
              `Welcome to the official **${gameDef.name} Registration Desk**!\n\n` +
              `• **Tournament Dashboards:** Live registration dashboards, QR codes, and entry fees appear below.\n` +
              `• **How to Register:** Click the **[ 🎮 Register for Tournament ]** button on the active cup's dashboard.\n` +
              `• **Live Alerts:** You will receive automated alerts in this channel whenever a tournament starts or whenever a slot becomes available!`
            )
            .setFooter({ text: `${gameDef.name} Registration Portal` })
            .setTimestamp();

          await regChannel.send({ embeds: [regEmbed] }).catch(() => null);
        } else {
          await regChannel.setName(regChannelName).catch(() => null);
          await regChannel.setParent(category.id).catch(() => null);
          await regChannel.permissionOverwrites.set(readOnlyOverwrites).catch(() => null);
        }
        createdChannels.push(regChannel);

        // 2. Tournament Announcement Channel for this category
        const annChannelName = gameDef.announcementChannel || `📢-${gameDef.key.replace('_', '-')}-announcements`;
        let annChannel = guild.channels.cache.find(
          c => c.type === ChannelType.GuildText && (
            c.name === annChannelName ||
            (c.parentId === category.id && (c.name.includes('announcement') || c.name.includes('📢')))
          )
        );

        if (!annChannel) {
          annChannel = await guild.channels.create({
            name: annChannelName,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Official Tournament Announcements & Registration for ${gameDef.name}`,
            permissionOverwrites: readOnlyOverwrites
          });

          const annEmbed = new EmbedBuilder()
            .setColor(gameDef.color || '#FFA500')
            .setTitle(`📢 ${gameDef.name} — Tournament Announcements`)
            .setDescription(
              `Welcome to the official **${gameDef.name} Tournament Hub**!\n\n` +
              `• Official tournaments, match schedules, and cash cups will be announced here.\n` +
              `• Interactive registration buttons and QR codes will appear in this channel when cups are live.\n` +
              `• Keep notifications enabled to not miss any upcoming tournaments!`
            )
            .setFooter({ text: `${gameDef.name} Esports Division` })
            .setTimestamp();

          await annChannel.send({ embeds: [annEmbed] }).catch(() => null);
        } else {
          await annChannel.setName(annChannelName).catch(() => null);
          await annChannel.setParent(category.id).catch(() => null);
          await annChannel.permissionOverwrites.set(readOnlyOverwrites).catch(() => null);
        }
        createdChannels.push(annChannel);

        // 2. Scoreboard Channel for this category
        const scoreChannelName = gameDef.scoreboardChannel || `📊-${gameDef.key.replace('_', '-')}-scoreboard`;
        let scoreChannel = guild.channels.cache.find(
          c => c.type === ChannelType.GuildText && (
            c.name === scoreChannelName ||
            (c.parentId === category.id && (c.name.includes('scoreboard') || c.name.includes('📊')))
          )
        );

        if (!scoreChannel) {
          scoreChannel = await guild.channels.create({
            name: scoreChannelName,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Live Tournament Standings, Match Results & Brackets for ${gameDef.name}`,
            permissionOverwrites: readOnlyOverwrites
          });

          const scoreEmbed = new EmbedBuilder()
            .setColor('#00E676')
            .setTitle(`📊 ${gameDef.name} — Live Scoreboard & Bracket`)
            .setDescription(
              `Welcome to the live scoreboard for **${gameDef.name}**.\n\n` +
              `• Live match standings, 8-player brackets, and championship results update here in real time.\n` +
              `• When a tournament is active, the live bracket will be displayed below!`
            )
            .setFooter({ text: `${gameDef.name} Live Standings` })
            .setTimestamp();

          await scoreChannel.send({ embeds: [scoreEmbed] }).catch(() => null);
        } else {
          await scoreChannel.setName(scoreChannelName).catch(() => null);
          await scoreChannel.setParent(category.id).catch(() => null);
          await scoreChannel.permissionOverwrites.set(readOnlyOverwrites).catch(() => null);
        }
        createdChannels.push(scoreChannel);

        // 3. Text Chat Channel for this game
        let textChannel = guild.channels.cache.find(
          c => c.type === ChannelType.GuildText && (
            c.name === gameDef.textChannel ||
            c.name.toLowerCase() === gameDef.textChannel.toLowerCase() ||
            c.name.toLowerCase().includes(gameDef.key.replace('_', '-')) ||
            c.name.toLowerCase().includes(gameDef.name.toLowerCase().replace(' ', '-'))
          )
        );

        if (!textChannel) {
          textChannel = await guild.channels.create({
            name: gameDef.textChannel,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Exclusive chat and party finding for ${gameDef.name} players`,
            permissionOverwrites: catOverwrites
          });
        } else {
          await textChannel.setParent(category.id).catch(() => null);
          await textChannel.permissionOverwrites.set(catOverwrites).catch(() => null);
        }
        createdChannels.push(textChannel);

        // 4. Voice Channel for this game
        let voiceChannel = guild.channels.cache.find(
          c => c.type === ChannelType.GuildVoice && (
            c.name === gameDef.voiceChannel ||
            c.name.toLowerCase() === gameDef.voiceChannel.toLowerCase() ||
            c.name.toLowerCase().includes(gameDef.name.toLowerCase())
          )
        );

        if (!voiceChannel) {
          voiceChannel = await guild.channels.create({
            name: gameDef.voiceChannel,
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: catOverwrites
          });
        } else {
          await voiceChannel.setParent(category.id).catch(() => null);
          await voiceChannel.permissionOverwrites.set(catOverwrites).catch(() => null);
        }
        createdChannels.push(voiceChannel);
      }

      // Also ensure main 🏆 TOURNAMENTS category has announcement & scoreboard channels
      let mainTourneyCat = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('tournament')
      );
      if (mainTourneyCat) {
        let globalAnn = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.parentId === mainTourneyCat.id && c.name.includes('announcement'));
        if (!globalAnn) {
          globalAnn = await guild.channels.create({
            name: '📢-tournaments-announcements',
            type: ChannelType.GuildText,
            parent: mainTourneyCat.id,
            topic: 'All Major Esports Tournaments & Cash Cup Announcements'
          });
          createdChannels.push(globalAnn);
        }

        let globalScore = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.parentId === mainTourneyCat.id && c.name.includes('scoreboard'));
        if (!globalScore) {
          globalScore = await guild.channels.create({
            name: '📊-tournaments-scoreboard',
            type: ChannelType.GuildText,
            parent: mainTourneyCat.id,
            topic: 'Global Tournament Brackets & Champions Hall of Fame'
          });
          createdChannels.push(globalScore);
        }
      }

      // If old generic hub category is empty, delete it
      if (oldHubCategory) {
        const remainingChildren = guild.channels.cache.filter(c => c.parentId === oldHubCategory.id);
        if (remainingChildren.size === 0) {
          await oldHubCategory.delete('Cleaned up consolidated game hub category').catch(() => null);
        }
      }

      return { success: true, categories: createdCategories, channels: createdChannels, roleMap };
    } catch (err) {
      console.error('[GameRoleManager] Error setting up game hubs:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Toggles game roles for a member based on their select menu choices.
   */
  updateMemberGameRoles: async (member, selectedKeys = []) => {
    try {
      const guild = member.guild;
      const refreshedMember = await guild.members.fetch(member.id).catch(() => member);
      const roleMap = await gameRoleHandler.ensureGameRoles(guild);
      const added = [];
      const removed = [];

      for (const gameDef of config.gameRoles) {
        const role = roleMap.get(gameDef.key);
        if (!role) continue;

        const isSelected = selectedKeys.includes(gameDef.key);
        const hasRole = refreshedMember.roles.cache.has(role.id);

        if (isSelected && !hasRole) {
          await refreshedMember.roles.add(role, 'Game role selection');
          added.push(gameDef.name);
          console.log(`[GameRoleManager] Added role ${gameDef.name} to ${refreshedMember.user.tag}`);
        } else if (!isSelected && hasRole) {
          await refreshedMember.roles.remove(role, 'Game role deselection');
          removed.push(gameDef.name);
          console.log(`[GameRoleManager] Removed role ${gameDef.name} from ${refreshedMember.user.tag}`);
        }
      }

      return { success: true, added, removed };
    } catch (err) {
      console.error('[GameRoleManager] Error updating member game roles:', err);
      if (err.code === 50013) {
        console.warn('⚠️ [ROLE HIERARCHY WARNING] Bot role is placed below game roles in Server Settings > Roles! Drag the bot role higher.');
      }
      return { success: false, message: err.message };
    }
  },

  /**
   * Toggles a single game role on or off for a member (1-click button interaction).
   */
  toggleMemberGameRole: async (member, gameKey) => {
    try {
      const guild = member.guild;
      const gameDef = config.gameRoles.find(g => g.key === gameKey);
      if (!gameDef) {
        return { success: false, message: 'Game configuration not found.' };
      }

      const roleMap = await gameRoleHandler.ensureGameRoles(guild);
      const role = roleMap.get(gameKey);
      if (!role) {
        return { success: false, message: `Role for ${gameDef.name} could not be found or created.` };
      }

      const refreshedMember = await guild.members.fetch(member.id).catch(() => member);
      const hasRole = refreshedMember.roles.cache.has(role.id);

      if (hasRole) {
        await refreshedMember.roles.remove(role, 'User toggled off game role');
        console.log(`[GameRoleManager] Removed role ${gameDef.name} from ${refreshedMember.user.tag}`);
        return {
          success: true,
          action: 'removed',
          gameName: gameDef.name,
          message: `❌ Removed the **${gameDef.name}** role. Channels for ${gameDef.name} are now hidden.`
        };
      } else {
        await refreshedMember.roles.add(role, 'User toggled on game role');
        console.log(`[GameRoleManager] Added role ${gameDef.name} to ${refreshedMember.user.tag}`);
        const textChannel = guild.channels.cache.find(c => c.name === gameDef.textChannel);
        const channelMention = textChannel ? `<#${textChannel.id}>` : `#${gameDef.textChannel}`;
        return {
          success: true,
          action: 'added',
          gameName: gameDef.name,
          message: `✅ Added the **${gameDef.name}** role! You now have access to ${channelMention} and the voice lounge!`
        };
      }
    } catch (err) {
      console.error(`[GameRoleManager] Error toggling game role ${gameKey}:`, err);
      if (err.code === 50013) {
        console.warn('⚠️ [ROLE HIERARCHY WARNING] Bot role is placed below game roles in Server Settings > Roles! Drag the bot role higher.');
      }
      return { success: false, message: `Failed to update role: ${err.message}` };
    }
  },

  /**
   * Posts or updates the interactive Pick-Your-Games embed & select menu in #🎮-pick-your-games.
   */
  ensurePickYourGamesPanel: async (guild) => {
    try {
      await guild.channels.fetch().catch(() => null);
      await guild.roles.fetch().catch(() => null);

      let pickGamesChannel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && (c.name === 'pick-your-games' || c.name === '🎮-pick-your-games')
      );

      if (!pickGamesChannel) {
        const infoCat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('INFORMATION'));
        pickGamesChannel = await guild.channels.create({
          name: '🎮-pick-your-games',
          type: ChannelType.GuildText,
          parent: infoCat ? infoCat.id : undefined,
          topic: 'Pick your games to unlock dedicated channels and tournaments'
        });
      }

      // Configure clean permissions: ViewChannel and ReadMessageHistory for everyone, SendMessages deny
      await pickGamesChannel.permissionOverwrites.set([
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory
          ],
          deny: [
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AddReactions,
            PermissionsBitField.Flags.CreatePublicThreads,
            PermissionsBitField.Flags.CreatePrivateThreads
          ]
        },
        {
          id: guild.client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]).catch(() => null);

      // Check messages in the channel
      const messages = await pickGamesChannel.messages.fetch({ limit: 10 }).catch(() => null);
      const existingPanel = messages?.find(m => 
        m.author.id === guild.client.user.id &&
        m.components.some(row => 
          row.components.some(c => c.customId === 'select_game_roles' || c.customId?.startsWith('btn_game_role_'))
        )
      );

      const payload = embedBuilder.createGameRolesEmbed(guild);

      if (existingPanel) {
        await existingPanel.edit(payload);
        console.log(`[GameRoleManager] Updated pick-your-games panel in #${pickGamesChannel.name}`);
        return { success: true, channel: pickGamesChannel, message: existingPanel, updated: true };
      } else {
        const newMsg = await pickGamesChannel.send(payload);
        console.log(`[GameRoleManager] Posted new pick-your-games panel in #${pickGamesChannel.name}`);
        return { success: true, channel: pickGamesChannel, message: newMsg, created: true };
      }
    } catch (err) {
      console.error('[GameRoleManager] Error ensuring pick-your-games panel:', err);
      return { success: false, error: err.message };
    }
  }
};

module.exports = gameRoleHandler;
