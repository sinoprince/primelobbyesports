const { ChannelType, PermissionsBitField } = require('discord.js');
const roleHandler = require('./roleHandler');
const ticketHandler = require('./ticketHandler');
const voiceHandler = require('./voiceHandler');
const gameRoleHandler = require('./gameRoleHandler');
const paymentHandler = require('./paymentHandler');
const embedBuilder = require('../utils/embedBuilder');
const { dbQueries } = require('../database/db');
const config = require('../../config.json');

const setupHandler = {
  /**
   * Initializes or updates server roles (Visitor, Member, Admin, Support).
   */
  setupRoles: async (guild) => {
    const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);
    const supportRole = await ticketHandler.ensureSupportRole(guild);
    return {
      success: true,
      message: `Roles initialized successfully! Visitor: @${visitorRole.name}, Member: @${memberRole.name}, Support: @${supportRole.name}`
    };
  },

  /**
   * Initializes 4 game categories, roles, and pick-your-games panel.
   */
  setupGames: async (guild) => {
    const res = await gameRoleHandler.setupGameHubs(guild);
    if (!res.success) {
      return { success: false, message: `Failed to setup Game Hubs: ${res.error}` };
    }
    await gameRoleHandler.ensurePickYourGamesPanel(guild);
    return {
      success: true,
      message: '4 Game Categories, Hubs, and Game Role Selector panel successfully initialized!'
    };
  },

  /**
   * Deploys rules and verification panel.
   */
  setupRules: async (guild, channelId = null) => {
    let targetChannel = channelId ? guild.channels.cache.get(channelId) : null;
    const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);

    if (!targetChannel) {
      let infoCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('INFORMATION'));
      if (!infoCategory) {
        infoCategory = await guild.channels.create({
          name: '📌 INFORMATION',
          type: ChannelType.GuildCategory
        });
      }

      targetChannel = guild.channels.cache.find(c => c.name === 'rules' || c.name === '📜-rules');
      if (!targetChannel) {
        targetChannel = await guild.channels.create({
          name: '📜-rules',
          type: ChannelType.GuildText,
          parent: infoCategory.id,
          topic: 'Server rules and verification'
        });
      }
    }

    await roleHandler.configureDefaultServerPermissions(guild, targetChannel);
    const payload = embedBuilder.createRulesEmbed(guild.name);
    const rulesMessage = await targetChannel.send(payload);
    await rulesMessage.react(config.emojis.verify).catch(() => null);

    dbQueries.updateGuildSettings(guild.id, {
      rules_channel_id: targetChannel.id,
      rules_message_id: rulesMessage.id
    });

    return {
      success: true,
      message: `Rules & Verification Panel deployed in #${targetChannel.name}!`
    };
  },

  /**
   * Deploys Support Ticket desk panel.
   */
  setupTickets: async (guild, channelId = null) => {
    const ticketCategory = await ticketHandler.ensureTicketCategory(guild);
    let targetChannel = channelId ? guild.channels.cache.get(channelId) : null;

    if (!targetChannel) {
      targetChannel = guild.channels.cache.find(c => c.name === 'support-helpdesk' || c.name === '🎫-support-helpdesk');
      if (!targetChannel) {
        targetChannel = await guild.channels.create({
          name: '🎫-support-helpdesk',
          type: ChannelType.GuildText,
          parent: ticketCategory.id,
          topic: 'Support Desk'
        });
      }
    }

    const payload = embedBuilder.createTicketPanelEmbed();
    const ticketMessage = await targetChannel.send(payload);
    await ticketMessage.react(config.emojis.ticket).catch(() => null);

    dbQueries.updateGuildSettings(guild.id, {
      ticket_panel_message_id: ticketMessage.id,
      ticket_category_id: ticketCategory.id
    });

    return {
      success: true,
      message: `Support Ticket Desk deployed in #${targetChannel.name}!`
    };
  },

  /**
   * Deploys complete server setup (categories, channels, roles, payment desk, rules, ticket desk).
   */
  setupAll: async (guild, cleanRebuild = false) => {
    if (cleanRebuild) {
      await gameRoleHandler.cleanupOldGameHubsAndRoles(guild);
    }

    const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);

    // 1. INFORMATION Category
    let infoCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('INFORMATION'));
    if (!infoCategory) {
      infoCategory = await guild.channels.create({
        name: '📌 INFORMATION',
        type: ChannelType.GuildCategory
      });
    }

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
    const rulesPayload = embedBuilder.createRulesEmbed(guild.name);
    const rulesMessage = await rulesChannel.send(rulesPayload);
    await rulesMessage.react(config.emojis.verify).catch(() => null);

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

    // Pick Your Games Panel
    await gameRoleHandler.ensurePickYourGamesPanel(guild);

    // 2. 4 Game Categories
    await gameRoleHandler.setupGameHubs(guild);

    // 3. COMMUNITY Category
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

    // 4. TOURNAMENTS Category
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

    // 5. SUPPORT Category & Desk
    const ticketCategory = await ticketHandler.ensureTicketCategory(guild);
    let ticketDeskChannel = guild.channels.cache.find(c => c.name === 'support-helpdesk' || c.name === '🎫-support-helpdesk');
    if (!ticketDeskChannel) {
      ticketDeskChannel = await guild.channels.create({
        name: '🎫-support-helpdesk',
        type: ChannelType.GuildText,
        parent: ticketCategory.id,
        topic: 'Private Support & Admin Helpdesk'
      });
    }
    const ticketPayload = embedBuilder.createTicketPanelEmbed();
    const ticketMessage = await ticketDeskChannel.send(ticketPayload);
    await ticketMessage.react(config.emojis.ticket).catch(() => null);

    // Support Voice Rooms
    const voiceRes = await voiceHandler.setupSupportVoiceChannels(guild);

    // 6. PAYMENTS Category & Admin Verification
    const payRes = await paymentHandler.setupPaymentCategory(guild);

    // Save configuration to database
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

    return {
      success: true,
      message: 'Complete Discord Server layout, categories, rules, payment desk, and game hubs successfully created!'
    };
  }
};

module.exports = setupHandler;
