const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField } = require('discord.js');
const roleHandler = require('../../handlers/roleHandler');
const ticketHandler = require('../../handlers/ticketHandler');
const voiceHandler = require('../../handlers/voiceHandler');
const gameRoleHandler = require('../../handlers/gameRoleHandler');
const paymentHandler = require('../../handlers/paymentHandler');
const embedBuilder = require('../../utils/embedBuilder');
const { dbQueries } = require('../../database/db');
const config = require('../../../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Server initialization and automated channel creation')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('clean-rebuild')
        .setDescription('Deletes old/deprecated channels and cleanly builds all new categories and panels')
    )
    .addSubcommand(sub =>
      sub
        .setName('all')
        .setDescription('Builds all server categories, channels, game roles, and payment desk')
    )
    .addSubcommand(sub =>
      sub
        .setName('roles')
        .setDescription('Creates and verifies Visitor and Member roles')
    )
    .addSubcommand(sub =>
      sub
        .setName('games')
        .setDescription('Creates 4 Game Categories, Roles, Hubs, and selection panel')
    )
    .addSubcommand(sub =>
      sub
        .setName('rules')
        .setDescription('Creates or posts the Rules & Verification panel')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Existing channel to post the Rules panel in')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('tickets')
        .setDescription('Posts the Support Ticket Helpdesk panel')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Existing channel to post the Ticket panel in')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('support-voice')
        .setDescription('Configures the Support Waiting and Private Rooms')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    await interaction.deferReply({ ephemeral: false });

    try {
      if (subcommand === 'roles') {
        const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);
        return interaction.editReply({
          content: `✅ **Roles Initialized Successfully:**\n` +
            `• **Visitor Role:** <@&${visitorRole.id}>\n` +
            `• **Member Role:** <@&${memberRole.id}>\n\n` +
            `*New users will automatically receive the Visitor role, and switch to Member upon verification.*`
        });
      }

      if (subcommand === 'games') {
        const res = await gameRoleHandler.setupGameHubs(guild);
        if (!res.success) {
          return interaction.editReply({ content: `❌ Failed to setup Game Hubs: ${res.error}` });
        }

        // Post Game Selection Panel in info category or current channel
        const pickRes = await gameRoleHandler.ensurePickYourGamesPanel(guild);
        const pickGamesChannel = pickRes.channel;

        const gamesList = config.gameRoles.map(g => `• ${g.emoji} **${g.categoryName || g.name}** ➔ \`#${g.textChannel}\` + \`${g.voiceChannel}\` (Role: <@&${res.roleMap.get(g.key).id}>)`).join('\n');

        return interaction.editReply({
          content: `🎉 **4 Game Categories & Role-Locked Hubs Ready!**\n\n` +
            `${gamesList}\n\n` +
            `📌 **Game Selection Panel posted in:** <#${pickGamesChannel.id}>\n` +
            `*Members can now pick games from the dropdown to unlock their individual game category!*`
        });
      }

      if (subcommand === 'clean-rebuild' || subcommand === 'all') {
        // Step 1: Deep cleanup of old/deprecated game channels, old single hub category & obsolete channels
        if (subcommand === 'clean-rebuild') {
          await gameRoleHandler.cleanupOldGameHubsAndRoles(guild);

          // Clean old/deprecated category names or orphan channels
          for (const ch of guild.channels.cache.values()) {
            if (ch.id === interaction.channelId) continue;
            const lowerName = ch.name.toLowerCase();
            if (ch.type === ChannelType.GuildCategory && (lowerName === 'game hubs' || lowerName === '🎮 game hubs')) {
              const children = guild.channels.cache.filter(c => c.parentId === ch.id);
              if (children.size === 0) {
                await ch.delete('Cleaning old single hub category').catch(() => null);
              }
            }
          }
        }

        // Step 2: Ensure Roles Exist
        const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);

        // Step 3: Create Category "📌 INFORMATION" & Channels
        let infoCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('INFORMATION'));
        if (!infoCategory) {
          infoCategory = await guild.channels.create({
            name: '📌 INFORMATION',
            type: ChannelType.GuildCategory
          });
        }

        // Create Rules Channel
        let rulesChannel = guild.channels.cache.find(c => c.name === 'rules' || c.name === '📜-rules');
        if (!rulesChannel) {
          rulesChannel = await guild.channels.create({
            name: '📜-rules',
            type: ChannelType.GuildText,
            parent: infoCategory.id,
            topic: 'Server rules and member verification'
          });
        }
        await roleHandler.configureDefaultServerPermissions(guild, rulesChannel);

        // Post Rules Embed in #rules
        const rulesPayload = embedBuilder.createRulesEmbed(guild.name);
        const rulesMessage = await rulesChannel.send(rulesPayload);
        await rulesMessage.react(config.emojis.verify).catch(() => null);

        // Create Announcements Channel
        let announcementsChannel = guild.channels.cache.find(c => c.name === 'announcements' || c.name === '📢-announcements');
        if (!announcementsChannel) {
          announcementsChannel = await guild.channels.create({
            name: '📢-announcements',
            type: ChannelType.GuildText,
            parent: infoCategory.id,
            topic: 'Official server announcements'
          });
        }
        await roleHandler.configureAnnouncementsPermissions(guild, announcementsChannel);

        // Create Pick-Your-Games Channel in Information & Post Panel
        await gameRoleHandler.ensurePickYourGamesPanel(guild);

        // Step 4: Create 4 Dedicated Game Categories & Channels (Matching Layout)
        const gameHubsRes = await gameRoleHandler.setupGameHubs(guild);

        // Step 5: Create Category "💬 COMMUNITY"
        let communityCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('COMMUNITY'));
        if (!communityCategory) {
          communityCategory = await guild.channels.create({
            name: '💬 COMMUNITY',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
              },
              {
                id: visitorRole.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
              },
              {
                id: memberRole.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.Connect,
                  PermissionsBitField.Flags.Speak
                ]
              }
            ]
          });
        }

        let generalChat = guild.channels.cache.find(c => c.name === 'general-chat' || c.name === '💬-general-chat');
        if (!generalChat) {
          generalChat = await guild.channels.create({
            name: '💬-general-chat',
            type: ChannelType.GuildText,
            parent: communityCategory.id,
            topic: 'General conversation for verified members'
          });
        }

        let generalVoice = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name.includes('General Voice'));
        if (!generalVoice) {
          generalVoice = await guild.channels.create({
            name: '🔊 General Voice',
            type: ChannelType.GuildVoice,
            parent: communityCategory.id
          });
        }

        // Step 6: Create Category "🏆 TOURNAMENTS"
        let tourneyCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('TOURNAMENTS'));
        if (!tourneyCategory) {
          tourneyCategory = await guild.channels.create({
            name: '🏆 TOURNAMENTS',
            type: ChannelType.GuildCategory
          });
        }

        let tourneyDashboardChannel = guild.channels.cache.find(c => c.name === 'active-tournaments' || c.name === '🏆-active-tournaments');
        if (!tourneyDashboardChannel) {
          tourneyDashboardChannel = await guild.channels.create({
            name: '🏆-active-tournaments',
            type: ChannelType.GuildText,
            parent: tourneyCategory.id,
            topic: 'Live tournament dashboards and player registrations'
          });
        }

        // Step 7: Create Category "🎫 SUPPORT & TICKETS"
        let ticketCategory = await ticketHandler.ensureTicketCategory(guild);

        const adminOrStaffRole = guild.roles.cache.find(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase());
        const supportOverwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages
            ]
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.ManageMessages
            ]
          }
        ];
        if (adminOrStaffRole) {
          supportOverwrites.push({
            id: adminOrStaffRole.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageMessages
            ]
          });
        }

        let ticketDeskChannel = guild.channels.cache.find(c => c.name === 'support-helpdesk' || c.name === '🎫-support-helpdesk');
        if (!ticketDeskChannel) {
          ticketDeskChannel = await guild.channels.create({
            name: '🎫-support-helpdesk',
            type: ChannelType.GuildText,
            parent: ticketCategory.id,
            topic: 'Private Support & Admin Helpdesk',
            permissionOverwrites: supportOverwrites
          });
        } else {
          await ticketDeskChannel.permissionOverwrites.set(supportOverwrites);
        }

        // Post Ticket Panel in #support-helpdesk
        const ticketPayload = embedBuilder.createTicketPanelEmbed();
        const ticketMessage = await ticketDeskChannel.send(ticketPayload);
        await ticketMessage.react(config.emojis.ticket).catch(() => null);

        // Step 8: Create Support Voice Channels (Waiting Room, Support 1, Support 2)
        const voiceRes = await voiceHandler.setupSupportVoiceChannels(guild);

        // Step 9: Setup Public Payment Category & Admin Verification Channel
        const payRes = await paymentHandler.setupPaymentCategory(guild);

        // Step 10: Save IDs to database
        dbQueries.updateGuildSettings(guild.id, {
          visitor_role_id: visitorRole.id,
          member_role_id: memberRole.id,
          rules_channel_id: rulesChannel.id,
          rules_message_id: rulesMessage.id,
          ticket_panel_message_id: ticketMessage.id,
          ticket_category_id: ticketCategory.id,
          tournament_category_id: tourneyCategory.id,
          support_voice_id: voiceRes.channels && voiceRes.channels[0] ? voiceRes.channels[0].id : null,
          payment_desk_id: payRes.paymentDesk ? payRes.paymentDesk.id : null,
          admin_verification_channel_id: payRes.adminControlChannel ? payRes.adminControlChannel.id : null
        });

        const voiceRoomsList = (voiceRes.channels || []).map(c => `• <#${c.id}>`).join('\n');

        return interaction.editReply({
          content: `🎉 **Complete Server Layout Built Freshly!**\n\n` +
            `📁 **📌 INFORMATION**\n` +
            `• <#${rulesChannel.id}> — Rules & Verification Panel\n` +
            `• <#${announcementsChannel.id}> — Announcements (Bot/Admin only)\n` +
            `• <#${pickGamesChannel.id}> — **Game Roles & Channel Unlocks**\n\n` +
            `📁 **4 GAME CATEGORIES** *(Role-locked per game)*\n` +
            `• ⚽ Efootball ⚽, 🔥 Valorant 🔥, 🔫 free fire, 📱 Pubg mobile\n\n` +
            `📁 **💬 COMMUNITY** *(Members only)*\n` +
            `• <#${generalChat.id}>, <#${generalVoice.id}>\n\n` +
            `📁 **🏆 TOURNAMENTS**\n` +
            `• <#${tourneyDashboardChannel.id}> — Ready for \`/tournament create\`\n\n` +
            `📁 **🎫 SUPPORT TICKETS**\n` +
            `• <#${ticketDeskChannel.id}> — Support Helpdesk\n` +
            `${voiceRoomsList}\n\n` +
            `📁 **💳 PAYMENTS (Public)**\n` +
            `• <#${payRes.paymentDesk.id}> — Scan-to-Pay UPI Panel & Submit Proof\n\n` +
            `📁 **🛡️ ADMIN CATEGORY (Private)**\n` +
            `• <#${payRes.adminControlChannel.id}> — **One Verification Channel** for Screenshot Approvals\n` +
            `• <#${payRes.ledgerChannel.id}> — Financial Invoices & Revenue Logs\n\n` +
            `*All channels and permissions configured!*`
        });
      }

      if (subcommand === 'rules') {
        let targetChannel = interaction.options.getChannel('channel');
        const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);

        if (!targetChannel) {
          targetChannel = await guild.channels.create({
            name: '📜-rules',
            type: ChannelType.GuildText,
            topic: 'Server rules and verification'
          });
        }

        await roleHandler.configureDefaultServerPermissions(guild, targetChannel);

        const payload = embedBuilder.createRulesEmbed(guild.name);
        const rulesMessage = await targetChannel.send(payload);
        await rulesMessage.react(config.emojis.verify).catch(() => null);

        dbQueries.updateGuildSettings(guild.id, {
          rules_channel_id: targetChannel.id,
          rules_message_id: rulesMessage.id
        });

        return interaction.editReply({
          content: `✅ **Rules & Verification Panel deployed** in <#${targetChannel.id}>!\n` +
            `Users can click the button or react with ${config.emojis.verify} to verify.`
        });
      }

      if (subcommand === 'tickets') {
        let targetChannel = interaction.options.getChannel('channel');
        const ticketCategory = await ticketHandler.ensureTicketCategory(guild);

        if (!targetChannel) {
          targetChannel = await guild.channels.create({
            name: '🎫-support-helpdesk',
            type: ChannelType.GuildText,
            parent: ticketCategory.id,
            topic: 'Support Desk'
          });
        }

        const payload = embedBuilder.createTicketPanelEmbed();
        const ticketMessage = await targetChannel.send(payload);
        await ticketMessage.react(config.emojis.ticket).catch(() => null);

        dbQueries.updateGuildSettings(guild.id, {
          ticket_panel_message_id: ticketMessage.id
        });

        return interaction.editReply({
          content: `✅ **Support Ticket Desk deployed** in <#${targetChannel.id}>!`
        });
      }

      if (subcommand === 'support-voice') {
        const res = await voiceHandler.setupSupportVoiceChannels(guild);
        if (!res.success) {
          return interaction.editReply({ content: `❌ Error: ${res.error}` });
        }

        const roomList = (res.channels || []).map(c => `• <#${c.id}>`).join('\n');
        return interaction.editReply({
          content: `✅ **Support Voice Channels Ready:**\n${roomList}\n\n` +
            `• Users will be **muted by default** upon entering.\n` +
            `• Admins can unmute users via ticket buttons or \`/ticket unmute-voice\`.`
        });
      }
    } catch (err) {
      console.error('[SetupCommand] Error:', err);
      return interaction.editReply({ content: `❌ Setup failed: ${err.message}` });
    }
  }
};
