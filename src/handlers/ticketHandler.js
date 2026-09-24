const { ChannelType, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { dbQueries } = require('../database/db');
const embedBuilder = require('../utils/embedBuilder');
const config = require('../../config.json');

const ticketHandler = {
  /**
   * Ensures the Support Tickets category exists in the guild.
   */
  /**
   * Ensures the Support role exists in the guild.
   */
  ensureSupportRole: async (guild) => {
    let supportRole = guild.roles.cache.find(r =>
      r.name.toLowerCase() === 'support' ||
      r.name.toLowerCase() === 'support staff' ||
      r.name.toLowerCase() === (config.roles?.staff || 'support staff').toLowerCase() ||
      r.name.toLowerCase().includes('support')
    );

    if (!supportRole) {
      try {
        supportRole = await guild.roles.create({
          name: 'Support',
          color: '#9B59B6',
          mentionable: true,
          reason: 'Dedicated role for Support team to view and respond to tickets'
        });
        console.log(`[TicketManager] Created dedicated Support role in ${guild.name}`);
      } catch (err) {
        console.error('[TicketManager] Failed to create Support role:', err.message);
      }
    }

    return supportRole;
  },

  /**
   * Ensures the Support Tickets category exists in the guild and is visible only to Support and Admins.
   */
  ensureTicketCategory: async (guild) => {
    const settings = dbQueries.getGuildSettings(guild.id) || {};
    let category = settings.ticket_category_id ? guild.channels.cache.get(settings.ticket_category_id) : null;

    if (!category) {
      category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && (
          c.name.toLowerCase() === config.categories.tickets.toLowerCase() ||
          c.name.toLowerCase().includes('ticket') ||
          c.name.toLowerCase().includes('support ticket')
        )
      );
    }

    const supportRole = await ticketHandler.ensureSupportRole(guild);
    const memberRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'member');
    const visitorRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'visitor');
    const adminRoles = guild.roles.cache.filter(r =>
      r.permissions.has(PermissionsBitField.Flags.Administrator) ||
      r.name.toLowerCase() === 'administrator' ||
      r.name.toLowerCase() === 'admin'
    );

    const catOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.SendMessages
        ]
      }
    ];

    if (memberRole) {
      catOverwrites.push({
        id: memberRole.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      });
    }

    if (visitorRole) {
      catOverwrites.push({
        id: visitorRole.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      });
    }

    if (supportRole) {
      catOverwrites.push({
        id: supportRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks
        ]
      });
    }

    for (const r of adminRoles.values()) {
      if (!catOverwrites.some(o => o.id === r.id)) {
        catOverwrites.push({
          id: r.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks
          ]
        });
      }
    }

    if (!category) {
      category = await guild.channels.create({
        name: config.categories.tickets,
        type: ChannelType.GuildCategory,
        permissionOverwrites: catOverwrites
      });
      dbQueries.updateGuildSettings(guild.id, { ticket_category_id: category.id });
    } else {
      await category.permissionOverwrites.set(catOverwrites).catch(() => null);
    }

    return category;
  },

  /**
   * Creates a private ticket channel for a user (visible only to the user, Support role, and Admins).
   */
  createTicketChannel: async (guild, member, categoryName = 'General Support') => {
    try {
      await guild.roles.fetch().catch(() => null);

      // Check if user already has an active open ticket
      const existing = dbQueries.getUserOpenTicket(guild.id, member.id);
      if (existing) {
        const existingChannel = guild.channels.cache.get(existing.channel_id);
        if (existingChannel) {
          return {
            success: false,
            message: `You already have an open ticket in <#${existing.channel_id}>!`
          };
        }
      }

      const ticketCategory = await ticketHandler.ensureTicketCategory(guild);
      const supportRole = await ticketHandler.ensureSupportRole(guild);
      const memberRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'member');
      const visitorRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'visitor');

      const permissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: member.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks
          ]
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks
          ]
        }
      ];

      // Explicitly deny regular Member & Visitor roles
      if (memberRole) {
        permissionOverwrites.push({
          id: memberRole.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        });
      }

      if (visitorRole) {
        permissionOverwrites.push({
          id: visitorRole.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        });
      }

      // Explicitly allow Support Role
      if (supportRole) {
        permissionOverwrites.push({
          id: supportRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks
          ]
        });
      }

      // Allow Admin & Staff roles
      const adminAndStaffRoles = guild.roles.cache.filter(r =>
        r.permissions.has(PermissionsBitField.Flags.Administrator) ||
        r.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
        r.name.toLowerCase() === 'administrator' ||
        r.name.toLowerCase() === 'admin' ||
        r.name.toLowerCase().includes('admin') ||
        r.name.toLowerCase().includes('support') ||
        r.name.toLowerCase().includes('staff') ||
        r.name.toLowerCase().includes('mod')
      );

      for (const role of adminAndStaffRoles.values()) {
        if (!permissionOverwrites.some(p => p.id === role.id)) {
          permissionOverwrites.push({
            id: role.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.EmbedLinks
            ]
          });
        }
      }

      // Format channel name
      const sanitizedUsername = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
      const channelName = `ticket-${sanitizedUsername || member.id.substring(0, 4)}`;

      // Create text channel
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategory.id,
        topic: `Support ticket for ${member.user.tag} (${member.id}) | Category: ${categoryName}`,
        permissionOverwrites
      });

      // Save in database
      const { ticketNumber } = dbQueries.createTicket(
        guild.id,
        member.id,
        member.user.tag,
        ticketChannel.id,
        categoryName
      );

      // Post welcome embed in the new channel
      const payload = embedBuilder.createTicketWelcomeEmbed(member.user, categoryName, ticketNumber);
      const pingText = supportRole ? `<@&${supportRole.id}>` : '@Admin';
      await ticketChannel.send({
        content: `👋 <@${member.id}> | Support Staff ping: ${pingText}`,
        ...payload
      });

      return {
        success: true,
        channel: ticketChannel,
        ticketNumber
      };
    } catch (err) {
      console.error('[TicketManager] Error creating ticket channel:', err);
      return { success: false, message: `Failed to create ticket: ${err.message}` };
    }
  },

  /**
   * Generates a transcript of messages in the ticket channel.
   */
  generateTranscript: async (channel) => {
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const sorted = Array.from(messages.values()).reverse();

      let transcript = `=== TICKET TRANSCRIPT FOR #${channel.name} ===\n`;
      transcript += `Exported: ${new Date().toISOString()}\n`;
      transcript += `==============================================\n\n`;

      for (const msg of sorted) {
        const time = msg.createdAt.toISOString().replace('T', ' ').substring(0, 19);
        transcript += `[${time}] ${msg.author.tag}: ${msg.content || ''}\n`;
        if (msg.attachments.size > 0) {
          msg.attachments.forEach(att => {
            transcript += `   [Attachment: ${att.url}]\n`;
          });
        }
      }

      return Buffer.from(transcript, 'utf-8');
    } catch (err) {
      console.error('[TicketManager] Error generating transcript:', err);
      return null;
    }
  },

  /**
   * Closes and deletes the ticket channel.
   */
  closeTicket: async (channel, closerMember) => {
    try {
      const ticketRecord = dbQueries.getTicketByChannel(channel.id);
      
      // Update database
      dbQueries.closeTicket(channel.id);

      // Generate Transcript buffer
      const transcriptBuffer = await ticketHandler.generateTranscript(channel);
      let attachment = null;
      if (transcriptBuffer) {
        attachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${channel.name}.txt` });
      }

      // Notify in channel
      await channel.send({
        content: `🔒 **Ticket closed by <@${closerMember.id}>.**\nThis channel will be deleted in 5 seconds...`,
        files: attachment ? [attachment] : []
      });

      // Attempt to DM the ticket creator the transcript
      if (ticketRecord) {
        try {
          const creator = await channel.guild.members.fetch(ticketRecord.user_id).catch(() => null);
          if (creator && attachment) {
            await creator.send({
              content: `📄 Your support ticket **#${channel.name}** in **${channel.guild.name}** has been closed. Here is your transcript:`,
              files: [attachment]
            }).catch(() => null);
          }
        } catch {
          // Ignore DM errors if user has DMs closed
        }
      }

      // Delete channel after delay
      setTimeout(async () => {
        await channel.delete('Ticket closed by staff/user').catch(() => null);
      }, 5000);

      return { success: true };
    } catch (err) {
      console.error('[TicketManager] Error closing ticket:', err);
      return { success: false, message: err.message };
    }
  },

  /**
   * Claims ticket for staff member.
   */
  claimTicket: async (channel, staffMember) => {
    try {
      dbQueries.claimTicket(channel.id, staffMember.id);
      await channel.send({
        content: `🙋 **Ticket claimed!** <@${staffMember.id}> is now handling this support request.`
      });
      return { success: true };
    } catch (err) {
      console.error('[TicketManager] Error claiming ticket:', err);
      return { success: false, message: err.message };
    }
  }
};

module.exports = ticketHandler;
