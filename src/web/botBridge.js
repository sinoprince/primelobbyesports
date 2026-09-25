const { Client, GatewayIntentBits } = require('discord.js');
const { dbQueries } = require('../database/db');
const tournamentHandler = require('../handlers/tournamentHandler');
const paymentHandler = require('../handlers/paymentHandler');
const config = require('../../config.json');

let botClient = null;

const botBridge = {
  /**
   * Attach the active Discord client.
   */
  setClient: (client) => {
    botClient = client;
  },

  /**
   * Get the attached Discord client or initialize a fallback.
   */
  getClient: async () => {
    if (botClient && botClient.isReady()) return botClient;

    if (!botClient && process.env.DISCORD_TOKEN) {
      botClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildMessages
        ]
      });
      await botClient.login(process.env.DISCORD_TOKEN).catch(err => {
        console.error('[BotBridge] Client login error:', err.message);
      });
    }

    return botClient;
  },

  /**
   * Get the primary Guild instance.
   */
  getGuild: async () => {
    const client = await botBridge.getClient();
    if (!client) return null;
    const guildId = process.env.GUILD_ID;
    return (guildId ? client.guilds.cache.get(guildId) : null) || client.guilds.cache.first();
  },

  /**
   * Returns text and announcement channels for web selectors.
   */
  getChannels: async () => {
    const guild = await botBridge.getGuild();
    if (!guild) return [];
    await guild.channels.fetch().catch(() => null);

    return guild.channels.cache
      .filter(c => c.type === 0) // GuildText
      .map(c => ({
        id: c.id,
        name: c.name,
        category: c.parent ? c.parent.name : null
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Aggregates stats for the dashboard overview.
   */
  getStats: () => {
    const tournaments = dbQueries.getAllTournaments ? dbQueries.getAllTournaments() : (dbQueries.getActiveTournaments ? dbQueries.getActiveTournaments(process.env.GUILD_ID || '1543502896753287198') : []);
    const payments = dbQueries.getAllPayments ? dbQueries.getAllPayments() : [];
    const tickets = dbQueries.getAllTickets ? dbQueries.getAllTickets() : [];

    // Derive totals from storage
    const storage = require('../../data/storage.json');
    const allTourneys = storage.tournaments || [];
    const allParticipants = storage.tournament_participants || [];
    const allPayments = storage.payments || [];
    const allTickets = storage.tickets || [];

    const activeTournaments = allTourneys.filter(t => t.status === 'OPEN' || t.status === 'STARTED');
    const completedTournaments = allTourneys.filter(t => t.status === 'COMPLETED');
    const pendingPayments = allPayments.filter(p => p.status === 'PENDING');
    const approvedPayments = allPayments.filter(p => p.status === 'APPROVED');
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + (parseInt(p.amount, 10) || 0), 0);
    const openTickets = allTickets.filter(t => t.status === 'OPEN' || t.status === 'CLAIMED');

    return {
      totalTournaments: allTourneys.length,
      activeTournaments: activeTournaments.length,
      completedTournaments: completedTournaments.length,
      totalParticipants: allParticipants.length,
      confirmedParticipants: allParticipants.filter(p => p.payment_status === 'CONFIRMED').length,
      totalRevenue,
      pendingPayments: pendingPayments.length,
      approvedPayments: approvedPayments.length,
      openTickets: openTickets.length
    };
  },

  /**
   * Host a new tournament from the web interface.
   */
  hostTournament: async (data) => {
    const guild = await botBridge.getGuild();
    if (!guild) throw new Error('Discord server not connected');

    const creatorId = data.created_by || guild.ownerId || 'WebAdmin';
    const creatorMember = await guild.members.fetch(creatorId).catch(() => guild.members.me);

    let dashboardChannel = null;
    if (data.dashboard_channel_id) {
      dashboardChannel = await guild.channels.fetch(data.dashboard_channel_id).catch(() => null);
    }

    const gpayInfo = `UPI ID: ${config.payment.upiId || 'sinoprince366-1@okhdfcbank'}\nAmount: ${data.entry_fee}\nScan QR Code on Dashboard to pay`;

    return await tournamentHandler.createTournament(guild, creatorMember, {
      title: data.title,
      game: data.game,
      mode: data.mode,
      maxParticipants: parseInt(data.max_participants, 10),
      entryFee: data.entry_fee,
      prizePool: data.prize_pool,
      gpayInfo,
      rulesText: data.rules_text || '',
      dashboardChannel
    });
  },

  /**
   * Starts a tournament from the web interface.
   */
  startTournament: async (tournamentId) => {
    const client = await botBridge.getClient();
    return await tournamentHandler.startTournament(client, tournamentId);
  },

  /**
   * Closes a tournament from the web interface.
   */
  closeTournament: async (tournamentId, winner = 'Winner Announced', deleteChannels = false) => {
    const client = await botBridge.getClient();
    const guild = await botBridge.getGuild();
    const adminMember = guild ? guild.members.me : null;
    return await tournamentHandler.closeTournament(client, tournamentId, adminMember, winner, deleteChannels);
  },

  /**
   * Approves a payment from the web interface.
   */
  approvePayment: async (paymentId, note = 'Approved via Admin Web Dashboard') => {
    const client = await botBridge.getClient();
    const guild = await botBridge.getGuild();
    const adminMember = guild ? guild.members.me : { id: 'web-admin', guild: guild || { name: 'Prime Lobby Esports' } };
    return await paymentHandler.approvePayment(client, paymentId, adminMember, note);
  },

  /**
   * Rejects a payment from the web interface.
   */
  rejectPayment: async (paymentId, reason = 'Payment rejected via Admin Web Dashboard') => {
    const client = await botBridge.getClient();
    const guild = await botBridge.getGuild();
    const adminMember = guild ? guild.members.me : { id: 'web-admin', guild: guild || { name: 'Prime Lobby Esports' } };
    return await paymentHandler.rejectPayment(client, paymentId, adminMember, reason);
  },

  /**
   * Requests more proof from the player via the web interface.
   */
  requestProof: async (paymentId, note = 'Please provide clear screenshot (JPG/PNG) showing 12-digit UTR') => {
    const client = await botBridge.getClient();
    const guild = await botBridge.getGuild();
    const adminMember = guild ? guild.members.me : { id: 'web-admin', guild: guild || { name: 'Prime Lobby Esports' } };
    return await paymentHandler.requestMoreProof(client, paymentId, adminMember, note);
  },

  /**
   * Kicks or removes a participant from a tournament.
   */
  removeParticipant: async (tournamentId, userId) => {
    const client = await botBridge.getClient();
    const guild = await botBridge.getGuild();
    const adminMember = guild ? guild.members.me : null;
    return await tournamentHandler.rejectPayment(client, tournamentId, userId, adminMember);
  },

  /**
   * Manually adds a team / participant to a tournament from the web dashboard.
   */
  addParticipant: async (tournamentId, { teamName, ign, userId, username, slotStatus = 'CONFIRMED', utr = 'Admin Entry' }) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    const client = await botBridge.getClient();
    const guild = await botBridge.getGuild();

    // Generate or format user identifier
    let finalUserId = userId ? String(userId).trim() : null;
    let finalUsername = username ? String(username).trim() : null;

    if (!finalUserId) {
      finalUserId = `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    if (!finalUsername) {
      finalUsername = teamName || `Player_${finalUserId.slice(-4)}`;
    }

    // Add to Database
    const added = dbQueries.addParticipant(
      tournamentId,
      finalUserId,
      finalUsername,
      ign || 'N/A',
      slotStatus || 'CONFIRMED',
      utr || 'Manual Entry',
      teamName || 'Solo Team'
    );

    if (!added) {
      return { success: false, message: 'Team or Player already registered for this tournament.' };
    }

    // Assign Tournament Role if Discord ID was supplied and guild exists
    if (guild && /^\d{17,20}$/.test(finalUserId) && tournament.tournament_role_id) {
      try {
        const member = await guild.members.fetch(finalUserId).catch(() => null);
        if (member) {
          await member.roles.add(tournament.tournament_role_id).catch(() => null);
        }
      } catch (err) {
        console.warn('[BotBridge] Could not assign role to manual user:', err.message);
      }
    }

    // Refresh Discord Dashboard & live balance slot alert
    if (client) {
      await tournamentHandler.refreshDashboard(client, tournamentId).catch(() => null);

      // Send confirmation in Registration channel if available
      if (tournament.dashboard_channel_id) {
        const regChan = await client.channels.fetch(tournament.dashboard_channel_id).catch(() => null);
        if (regChan) {
          const confirmedCount = dbQueries.getConfirmedParticipants(tournamentId).length;
          const max = tournament.max_participants || 25;
          const balance = Math.max(0, max - confirmedCount);

          await regChan.send({
            content: `📢 👥 **TEAM MANUALLY REGISTERED BY ADMIN!**\n` +
              `• **Tournament:** \`${tournament.title || tournament.name}\`\n` +
              `• **Team Name:** **${teamName || 'Solo'}**\n` +
              `• **In-Game ID / IGN:** \`${ign || 'N/A'}\`\n` +
              `• **Status:** \`${slotStatus}\`\n` +
              `• ⚡ **Balance Slots Remaining:** \`${balance} slots left\` (${confirmedCount}/${max} filled)`
          }).catch(() => null);
        }
      }
    }

    return {
      success: true,
      message: `Team "${teamName || finalUsername}" successfully registered to ${tournament.title || 'tournament'}!`
    };
  },

  /**
   * Updates participant slot/payment status (e.g. from RESERVED to CONFIRMED or vice versa).
   */
  updateParticipantStatus: async (tournamentId, userId, newStatus) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    const updated = dbQueries.updateParticipantStatus(tournamentId, userId, newStatus);
    if (!updated) {
      return { success: false, message: 'Participant not found in this tournament.' };
    }

    const client = await botBridge.getClient();
    const guild = await botBridge.getGuild();

    // If status changed to CONFIRMED and has Discord user ID, grant participant role
    if (newStatus === 'CONFIRMED' && guild && /^\d{17,20}$/.test(userId) && tournament.tournament_role_id) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.roles.add(tournament.tournament_role_id).catch(() => null);
          if (tournament.pending_role_id) {
            await member.roles.remove(tournament.pending_role_id).catch(() => null);
          }
        }
      } catch (err) {
        console.warn('[BotBridge] Could not update roles for member:', err.message);
      }
    } else if (newStatus !== 'CONFIRMED' && guild && /^\d{17,20}$/.test(userId) && tournament.tournament_role_id) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.roles.remove(tournament.tournament_role_id).catch(() => null);
          if (tournament.pending_role_id) {
            await member.roles.add(tournament.pending_role_id).catch(() => null);
          }
        }
      } catch (err) {
        console.warn('[BotBridge] Could not revert roles for member:', err.message);
      }
    }

    // Refresh Discord Tournament Dashboard so slot count & participant lists update live
    if (client) {
      await tournamentHandler.refreshDashboard(client, tournamentId).catch(() => null);

      const confirmedCount = dbQueries.getConfirmedParticipants(tournamentId).length;
      const maxSlots = tournament.max_participants || 25;
      const balanceSlots = Math.max(0, maxSlots - confirmedCount);
      const teamDisplay = updated.squad_name || updated.team_name || 'Solo Team';
      const ignDisplay = updated.ingame_id || updated.in_game_id || 'N/A';
      const userMention = /^\d{17,20}$/.test(userId) ? `<@${userId}>` : `**${updated.username || 'Player'}**`;

      // 1. Post Slot Notification in Registration Channel
      if (tournament.dashboard_channel_id) {
        const regChan = await client.channels.fetch(tournament.dashboard_channel_id).catch(() => null);
        if (regChan) {
          if (newStatus === 'CONFIRMED') {
            await regChan.send({
              content: `🎉 🎟️ **SLOT RESERVED & CONFIRMED!**\n` +
                `• **Tournament:** \`${tournament.title || tournament.name}\`\n` +
                `• **Team / Duo:** **${teamDisplay}** (${userMention})\n` +
                `• **In-Game ID / IGN:** \`${ignDisplay}\`\n` +
                `• **Slot Status:** \`✅ CONFIRMED & RESERVED\`\n` +
                `• ⚡ **Balance Slots Remaining:** \`${balanceSlots} slots left\` (${confirmedCount}/${maxSlots} confirmed)\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            }).catch(() => null);
          } else {
            await regChan.send({
              content: `⏳ ⚠️ **SLOT REVERTED TO RESERVED (UNPAID)**\n` +
                `• **Tournament:** \`${tournament.title || tournament.name}\`\n` +
                `• **Team / Duo:** **${teamDisplay}** (${userMention})\n` +
                `• **Slot Status:** \`⏳ RESERVED (UNPAID)\`\n` +
                `• ⚡ **Balance Slots Remaining:** \`${balanceSlots} slots left\` (${confirmedCount}/${maxSlots} confirmed)\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            }).catch(() => null);
          }
        }
      }

      // 2. Send DM notification to Player via Payment Bot
      if (newStatus === 'CONFIRMED' && /^\d{17,20}$/.test(userId)) {
        const paymentBotService = require('../utils/paymentBotService');
        await paymentBotService.sendDm(
          userId,
          {
            content: `🎉 🎟️ **YOUR TOURNAMENT SLOT IS OFFICIALLY RESERVED & CONFIRMED!**\n\n` +
              `• **Tournament:** **${tournament.title || tournament.name}**\n` +
              `• **Team Name:** **${teamDisplay}**\n` +
              `• **In-Game ID / IGN:** \`${ignDisplay}\`\n` +
              `• **Slot Status:** \`✅ CONFIRMED & RESERVED\`\n\n` +
              `Your slot has been confirmed by admins! You now have verified access to match chat <#${tournament.chat_channel_id}> and official voice lounges.`
          },
          client
        ).catch(() => null);
      }

      // 3. Welcome in Match Chat if confirmed
      if (newStatus === 'CONFIRMED' && tournament.chat_channel_id) {
        const chatChan = await client.channels.fetch(tournament.chat_channel_id).catch(() => null);
        if (chatChan) {
          await chatChan.send({
            content: `🎮 Welcome confirmed team **${teamDisplay}** (${userMention}) to **${tournament.title}**! Match chat is now unlocked for you.`
          }).catch(() => null);
        }
      }
    }

    return {
      success: true,
      message: `Participant "${updated.squad_name || updated.username}" status updated to ${newStatus}!`
    };
  },

  /**
   * Submits match score and refreshes scoreboard in Discord.
   */
  updateScoreboard: async (tournamentId, round, p1, p2, score, winner) => {
    const client = await botBridge.getClient();
    const guild = await botBridge.getGuild();
    const adminMember = (guild && guild.members && guild.members.me) ? guild.members.me : { id: 'web-admin', user: { tag: 'Web Admin', username: 'Web Admin' } };
    return await tournamentHandler.updateScoreboard(client, tournamentId, round, p1, p2, score, winner, adminMember);
  },

  /**
   * Deletes a match record and refreshes the live scoreboard in Discord.
   */
  deleteScoreboardEntry: async (tournamentId, entryId) => {
    const client = await botBridge.getClient();
    return await tournamentHandler.deleteScoreboardEntry(client, tournamentId, entryId);
  },

  /**
   * Sends an official announcement to any Discord channel from the web panel.
   */
  sendAnnouncement: async ({ channelId, title, message, ping = 'none', color = '#FFA500', imageUrl = null }) => {
    const client = await botBridge.getClient();
    if (!client) return { success: false, message: 'Discord client not connected.' };

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return { success: false, message: 'Selected Discord channel was not found.' };

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(message)
      .setFooter({ text: 'Prime Lobby Esports • Official Announcement' })
      .setTimestamp();

    if (imageUrl && imageUrl.trim()) {
      embed.setImage(imageUrl.trim());
    }

    let content = null;
    if (ping === 'everyone') content = '@everyone';
    else if (ping === 'here') content = '@here';

    const sent = await channel.send({
      content: content || undefined,
      embeds: [embed]
    });

    return {
      success: true,
      message: `Announcement "${title}" broadcasted to #${channel.name}!`,
      messageId: sent.id
    };
  },

  /**
   * Triggers Discord server initialization/setup directly from the website.
   */
  runSetup: async (type = 'all', options = {}) => {
    const guild = await botBridge.getGuild();
    if (!guild) return { success: false, message: 'Discord Server/Guild not connected.' };

    const setupHandler = require('../handlers/setupHandler');
    if (type === 'roles') {
      return await setupHandler.setupRoles(guild);
    } else if (type === 'games') {
      return await setupHandler.setupGames(guild);
    } else if (type === 'rules') {
      return await setupHandler.setupRules(guild, options.channelId);
    } else if (type === 'tickets') {
      return await setupHandler.setupTickets(guild, options.channelId);
    } else {
      return await setupHandler.setupAll(guild, options.cleanRebuild);
    }
  },

  /**
   * Closes a support ticket from the website.
   */
  closeTicket: async (channelId) => {
    const client = await botBridge.getClient();
    if (!client) return { success: false, message: 'Discord client not connected.' };

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return { success: false, message: 'Ticket channel not found in Discord.' };

    const ticketHandler = require('../handlers/ticketHandler');
    const closer = (channel.guild.members && channel.guild.members.me) ? channel.guild.members.me : { id: 'web-admin', user: { tag: 'Web Admin' } };
    return await ticketHandler.closeTicket(channel, closer);
  }
};

module.exports = botBridge;
