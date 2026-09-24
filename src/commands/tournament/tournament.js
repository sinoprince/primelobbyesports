const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const tournamentHandler = require('../../handlers/tournamentHandler');
const paymentHandler = require('../../handlers/paymentHandler');
const { dbQueries } = require('../../database/db');
const embedBuilder = require('../../utils/embedBuilder');
const config = require('../../../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Tournament management and live scoreboard system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('host-pubg')
        .setDescription('Admin: Host PUBG Mobile tournament (3 Maps: Erangel, Miramar, Sanhok — 100 Players)')
        .addStringOption(opt =>
          opt
            .setName('mode')
            .setDescription('Format: Squad (25 Squads / 4 per team) or Duo (50 Teams / 2 per team)')
            .setRequired(false)
            .addChoices(
              { name: 'Squad (25 Squads / 4 Players each = 100 Players Total)', value: 'squad' },
              { name: 'Duo (50 Teams / 2 Players each = 100 Players Total)', value: 'duo' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('entry_fee')
            .setDescription('Entry fee (default: ₹500 per Squad / ₹250 per Duo)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('prize_pool')
            .setDescription('Prize pool (default: 🥇 1st: ₹3,000 | 🥈 2nd: ₹2,000 | 🥉 3rd: ₹1,000)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Tournament Title (default: PUBG Mobile 3-Map Championship)')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('dashboard_channel')
            .setDescription('Channel to post announcement & dashboard in (defaults to #📢-pubg-announcements)')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('host-valorant')
        .setDescription('Admin: Host Valorant 5v5 (15 Teams — All Teams Play 2 Times Guaranteed)')
        .addStringOption(opt =>
          opt
            .setName('entry_fee')
            .setDescription('Entry fee (default: ₹1,000 per Team)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('prize_pool')
            .setDescription('Prize pool (default: 🥇 1st: ₹5,000 | 🥈 2nd: ₹2,500)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Tournament Title (default: Valorant 15-Team Championship - 2 Matches Guaranteed)')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('dashboard_channel')
            .setDescription('Channel to post announcement & dashboard in (defaults to #📢-valorant-announcements)')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('host-freefire')
        .setDescription('Admin: Host Free Fire (3 Maps / Play 3 Times: Bermuda, Purgatory, Kalahari — 48 Players)')
        .addStringOption(opt =>
          opt
            .setName('mode')
            .setDescription('Format: Squad (12 Squads / 4 per team) or Duo (24 Teams / 2 per team)')
            .setRequired(false)
            .addChoices(
              { name: 'Squad (12 Squads / 4 Players each = 48 Players Total)', value: 'squad' },
              { name: 'Duo (24 Teams / 2 Players each = 48 Players Total)', value: 'duo' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('entry_fee')
            .setDescription('Entry fee (default: ₹500 per Squad / ₹250 per Duo)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('prize_pool')
            .setDescription('Prize pool (default: 🥇 1st: ₹2,000 | 🥈 2nd: ₹1,000)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Tournament Title (default: Free Fire 3-Map Battle Royale Cup)')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName('dashboard_channel')
            .setDescription('Channel to post announcement & dashboard in (defaults to #📢-freefire-announcements)')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('host-efootball')
        .setDescription('Admin: Host an 8-Player eFootball tournament (₹250 fee, ₹1500 Instant 1st Prize)')
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Tournament Title (default: eFootball ₹1,500 Instant Cash Cup)')
        )
        .addChannelOption(opt =>
          opt
            .setName('dashboard_channel')
            .setDescription('Channel to post dashboard in (defaults to #📢-efootball-announcements)')
            .addChannelTypes(ChannelType.GuildText)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Admin: Initiate a custom tournament with automated channels & dashboard')
        .addStringOption(opt =>
          opt
            .setName('game')
            .setDescription('Game or Platform')
            .setRequired(true)
            .addChoices(
              { name: '⚽ eFootball', value: 'eFootball' },
              { name: '🔫 Free Fire', value: 'Free Fire' },
              { name: '🔥 Valorant', value: 'Valorant' },
              { name: '📱 PUBG Mobile', value: 'PUBG Mobile' },
              { name: '🎮 Custom Game', value: 'Custom Game' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Tournament Name / Edition')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('max_participants')
            .setDescription('Maximum player slots (e.g. 16, 32, 64)')
            .setRequired(true)
            .setMinValue(2)
            .setMaxValue(256)
        )
        .addStringOption(opt =>
          opt
            .setName('entry_fee')
            .setDescription('Entry Fee amount (e.g. ₹50 / Free)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('prize_pool')
            .setDescription('Prize Distribution (e.g. 1st: ₹1000 | 2nd: ₹500 | 3rd: ₹250)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('gpay_info')
            .setDescription('GPay / UPI Payment details (e.g. UPI: sinoprince366-1@okhdfcbank)')
        )
        .addStringOption(opt =>
          opt
            .setName('rules')
            .setDescription('Custom tournament rules, format (Knockout/League), or timings')
        )
        .addChannelOption(opt =>
          opt
            .setName('dashboard_channel')
            .setDescription('Channel to post the live tournament embed (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('scoreboard')
        .setDescription('Admin: Update match score & automatically broadcast winner to game announcements')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('Tournament ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('round')
            .setDescription('Round / Stage (e.g. Finals, Semi-Finals, Round 1)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('player1')
            .setDescription('Player / Team 1 Name')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('score')
            .setDescription('Final Score / Points (e.g. 3 - 1 or 15 pts [8 kills])')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('winner')
            .setDescription('Winner Name / Team')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('player2')
            .setDescription('Player / Team 2 Name (optional for Battle Royale point entries)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('scoreboard-view')
        .setDescription('View live tournament scoreboard and 8-player bracket')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('Tournament ID (defaults to active tournament)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('View all active tournaments currently open for registration')
    )
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('View detailed status and participant list for a tournament')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('Tournament ID')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Admin: Start a tournament and broadcast start alert to registration & match channels')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('Tournament ID to start')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription('Admin: End and close a tournament')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('Tournament ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('winner_announcement')
            .setDescription('Winner announcement message & podium results')
        )
        .addBooleanOption(opt =>
          opt
            .setName('delete_channels')
            .setDescription('Delete the event-specific channels and category? (Default: false)')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('kick')
        .setDescription('Admin: Remove a participant from a tournament')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('Tournament ID')
            .setRequired(true)
        )
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('User to remove')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member;

    // Check admin permission for management subcommands
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.some(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase().includes('host'));

    if (['create', 'host-efootball', 'host-pubg', 'host-valorant', 'host-freefire', 'start', 'scoreboard', 'end', 'kick'].includes(subcommand) && !isAdmin) {
      return interaction.reply({
        content: '🚫 You do not have permission to manage tournaments. Only Admins and Hosts can perform this action.',
        ephemeral: true
      });
    }

    if (subcommand === 'host-pubg') {
      await interaction.deferReply({ ephemeral: true });

      const mode = interaction.options.getString('mode') || 'squad';
      const customTitle = interaction.options.getString('title');
      const customFee = interaction.options.getString('entry_fee');
      const customPrize = interaction.options.getString('prize_pool');

      const isSquad = mode === 'squad';
      const maxParticipants = isSquad ? 25 : 50;
      const title = customTitle || (isSquad 
        ? 'PUBG Mobile 3-Map Championship (25 Squads / 100 Players)' 
        : 'PUBG Mobile 3-Map Championship (50 Duos / 100 Players)');
      const entryFee = customFee || (isSquad ? '₹500 per Squad' : '₹250 per Duo');
      const prizePool = customPrize || '🥇 1st: ₹3,000 | 🥈 2nd: ₹2,000 | 🥉 3rd: ₹1,000';
      const rules = isSquad
        ? '• 🗺️ 3 Maps Format: Match 1: Erangel | Match 2: Miramar | Match 3: Sanhok\n• Capacity: 25 Squads (4 players per team = 100 Players Total Cap)\n• 🏆 Overall Winner decided by Cumulative Points Table across all 3 Maps!\n• Official Esports Scoring: #1: 10pts, #2: 6pts, #3: 5pts, #4: 4pts, #5: 3pts, #6: 2pts, #7-8: 1pt | 1 Kill = 1 pt\n• Room ID & Password will be provided to confirmed squads in the private match channel before each map.\n• Emulators/hacks strictly prohibited.'
        : '• 🗺️ 3 Maps Format: Match 1: Erangel | Match 2: Miramar | Match 3: Sanhok\n• Capacity: 50 Duos (2 players per team = 100 Players Total Cap)\n• 🏆 Overall Winner decided by Cumulative Points Table across all 3 Maps!\n• Official Scoring: Rank Points + 1 pt per Kill across all 3 Maps\n• Room ID & Password provided in private match channel before each map.';

      let dashboardChannel = interaction.options.getChannel('dashboard_channel');
      if (!dashboardChannel) {
        dashboardChannel = guild.channels.cache.find(c => c.name === 'pubg-registration' || c.name === '📝-pubg-registration' || c.name === 'pubg-announcements' || c.name === '📢-pubg-announcements' || c.name === 'active-tournaments' || c.name === '🏆-active-tournaments') || interaction.channel;
      }

      const gpayInfo = `UPI ID: sinoprince366-1@okhdfcbank\nAmount: ${entryFee}\nScan QR Code on Dashboard to pay`;

      const result = await tournamentHandler.createTournament(guild, member, {
        title,
        game: 'PUBG Mobile',
        mode,
        maxParticipants,
        entryFee,
        prizePool,
        gpayInfo,
        rulesText: rules,
        dashboardChannel
      });

      if (!result.success) {
        return interaction.editReply({ content: `❌ Failed to create tournament: ${result.error}` });
      }

      // Announce in #📢-pubg-announcements or #📱-pubg-mobile
      const pubgHub = guild.channels.cache.find(c => c.name === 'pubg-mobile' || c.name === '📱-pubg-mobile' || c.name === 'pubg-announcements' || c.name === '📢-pubg-announcements');
      if (pubgHub && pubgHub.id !== dashboardChannel.id) {
        await pubgHub.send({
          content: `📱 🏆 **NEW PUBG Mobile 3-Map Tournament Hosted by Admin <@${member.id}>!**\n\n` +
            `• **Event:** **${title}**\n` +
            `• **🗺️ Maps:** \`Match 1: Erangel \| Match 2: Miramar \| Match 3: Sanhok\`\n` +
            `• **Format & Capacity:** \`${isSquad ? '25 Squads (100 Players Total)' : '50 Duos (100 Players Total)'}\`\n` +
            `• **Entry Fee:** \`${entryFee}\`\n` +
            `• **Prize Pool:** \`${prizePool}\`\n\n` +
            `👉 Head over to <#${dashboardChannel.id}> to register your team before slots fill up!`
        }).catch(() => null);
      }

      await paymentHandler.updatePaymentDesk(guild);

      return interaction.editReply({
        content: `🎉 **PUBG Mobile 3-Map ${isSquad ? '25-Squad' : '50-Duo'} Tournament #${result.tournamentId} Successfully Hosted!**\n\n` +
          `• **Title:** ${title}\n` +
          `• **🗺️ Format:** 3 Maps (Erangel, Miramar, Sanhok)\n` +
          `• **Capacity:** ${maxParticipants} ${isSquad ? 'Squads (4 players each = 100 players total)' : 'Duos (2 players each = 100 players total)'}\n` +
          `• **Entry Fee:** ${entryFee}\n` +
          `• **Prize Pool:** ${prizePool}\n` +
          `• **Live Dashboard & QR Code:** Posted in <#${dashboardChannel.id}>\n` +
          `• **Live Scoreboard & 3-Map Standings:** Posted in <#${result.tournament.scores_channel_id || result.tournament.scoreboard_channel_id}>\n` +
          `• **Event Channels:** <#${result.announcementsChannel.id}>, <#${result.chatChannel.id}>, <#${result.voiceLounge.id}>\n\n` +
          `*Teams can now scan the QR code to register and submit payment!*`
      });
    }

    if (subcommand === 'host-valorant') {
      await interaction.deferReply({ ephemeral: true });

      const customTitle = interaction.options.getString('title');
      const customFee = interaction.options.getString('entry_fee');
      const customPrize = interaction.options.getString('prize_pool');

      const maxParticipants = 15;
      const title = customTitle || 'Valorant 15-Team Championship (All Teams Play 2 Times Guaranteed)';
      const entryFee = customFee || '₹1,000 per Team';
      const prizePool = customPrize || '🥇 1st: ₹5,000 | 🥈 2nd: ₹2,500';
      const rules = '• 15 Teams Max (5 players per team = 75 Players Total)\n• ⚔️ FORMAT: All 15 Teams Play 2 Times Guaranteed (Double Elimination / 2-Match System)\n• Every team gets a second chance in Match 2 (Lower Bracket) before any elimination!\n• Standard Competitive Settings (Overtime: Win by 2, Cheats: Off)\n• Match schedules & server/room details coordinated in match chat.';

      let dashboardChannel = interaction.options.getChannel('dashboard_channel');
      if (!dashboardChannel) {
        dashboardChannel = guild.channels.cache.find(c => c.name === 'valorant-registration' || c.name === '📝-valorant-registration' || c.name === 'valorant-announcements' || c.name === '📢-valorant-announcements' || c.name === 'active-tournaments' || c.name === '🏆-active-tournaments') || interaction.channel;
      }

      const gpayInfo = `UPI ID: sinoprince366-1@okhdfcbank\nAmount: ${entryFee}\nScan QR Code on Dashboard to pay`;

      const result = await tournamentHandler.createTournament(guild, member, {
        title,
        game: 'Valorant',
        mode: '5v5',
        maxParticipants,
        entryFee,
        prizePool,
        gpayInfo,
        rulesText: rules,
        dashboardChannel
      });

      if (!result.success) {
        return interaction.editReply({ content: `❌ Failed to create tournament: ${result.error}` });
      }

      const valHub = guild.channels.cache.find(c => c.name === 'valorant' || c.name === '🔥-valorant' || c.name === 'valorant-announcements' || c.name === '📢-valorant-announcements');
      if (valHub && valHub.id !== dashboardChannel.id) {
        await valHub.send({
          content: `🔥 🏆 **NEW Valorant 5v5 Tournament Hosted by Admin <@${member.id}>!**\n\n` +
            `• **Event:** **${title}**\n` +
            `• **⚔️ Format:** \`All 15 Teams Play 2 Times Guaranteed (Double Elimination)\`\n` +
            `• **Capacity:** \`15 Teams (5v5 — 75 Players Total)\`\n` +
            `• **Entry Fee:** \`${entryFee}\`\n` +
            `• **Prize Pool:** \`${prizePool}\`\n\n` +
            `👉 Head over to <#${dashboardChannel.id}> to register your team!`
        }).catch(() => null);
      }

      await paymentHandler.updatePaymentDesk(guild);

      return interaction.editReply({
        content: `🎉 **Valorant 15-Team Tournament #${result.tournamentId} Successfully Hosted!**\n\n` +
          `• **Title:** ${title}\n` +
          `• **⚔️ Format:** All 15 Teams Play 2 Times Guaranteed (Double Elimination)\n` +
          `• **Capacity:** 15 Teams (5 players each = 75 players total)\n` +
          `• **Entry Fee:** ${entryFee}\n` +
          `• **Prize Pool:** ${prizePool}\n` +
          `• **Live Dashboard & QR Code:** Posted in <#${dashboardChannel.id}>\n` +
          `• **Live Scoreboard & 2-Match Bracket:** Posted in <#${result.tournament.scores_channel_id || result.tournament.scoreboard_channel_id}>\n` +
          `• **Event Channels:** <#${result.announcementsChannel.id}>, <#${result.chatChannel.id}>, <#${result.voiceLounge.id}>\n\n` +
          `*Teams can now register and claim their slots!*`
      });
    }

    if (subcommand === 'host-freefire') {
      await interaction.deferReply({ ephemeral: true });

      const mode = interaction.options.getString('mode') || 'squad';
      const customTitle = interaction.options.getString('title');
      const customFee = interaction.options.getString('entry_fee');
      const customPrize = interaction.options.getString('prize_pool');

      const isSquad = mode === 'squad';
      const maxParticipants = isSquad ? 12 : 24;
      const title = customTitle || (isSquad 
        ? 'Free Fire 3-Map Battle Royale (12 Squads / 48 Players)' 
        : 'Free Fire 3-Map Battle Royale (24 Duos / 48 Players)');
      const entryFee = customFee || (isSquad ? '₹500 per Squad' : '₹250 per Duo');
      const prizePool = customPrize || '🥇 1st: ₹2,000 | 🥈 2nd: ₹1,000';
      const rules = isSquad
        ? '• 🗺️ 3 Maps / Play 3 Times: Match 1: Bermuda | Match 2: Purgatory | Match 3: Kalahari\n• Capacity: 12 Squads (4 players per team = 48 Players Total Cap)\n• 🏆 Overall Winner decided by Cumulative Points Table across all 3 Matches!\n• Official BR Point System: Rank Points + 1 pt per Kill across all 3 Maps\n• Room ID & Password shared in private match channel before each game.'
        : '• 🗺️ 3 Maps / Play 3 Times: Match 1: Bermuda | Match 2: Purgatory | Match 3: Kalahari\n• Capacity: 24 Duos (2 players per team = 48 Players Total Cap)\n• 🏆 Overall Winner decided by Cumulative Points Table across all 3 Matches!\n• Official BR Point System: Rank Points + 1 pt per Kill across all 3 Maps\n• Room ID & Password shared in private match channel before each game.';

      let dashboardChannel = interaction.options.getChannel('dashboard_channel');
      if (!dashboardChannel) {
        dashboardChannel = guild.channels.cache.find(c => c.name === 'freefire-registration' || c.name === '📝-freefire-registration' || c.name === 'freefire-announcements' || c.name === '📢-freefire-announcements' || c.name === 'active-tournaments' || c.name === '🏆-active-tournaments') || interaction.channel;
      }

      const gpayInfo = `UPI ID: sinoprince366-1@okhdfcbank\nAmount: ${entryFee}\nScan QR Code on Dashboard to pay`;

      const result = await tournamentHandler.createTournament(guild, member, {
        title,
        game: 'Free Fire',
        mode,
        maxParticipants,
        entryFee,
        prizePool,
        gpayInfo,
        rulesText: rules,
        dashboardChannel
      });

      if (!result.success) {
        return interaction.editReply({ content: `❌ Failed to create tournament: ${result.error}` });
      }

      const ffHub = guild.channels.cache.find(c => c.name === 'free-fire' || c.name === '🔫-free-fire' || c.name === 'freefire-announcements' || c.name === '📢-freefire-announcements');
      if (ffHub && ffHub.id !== dashboardChannel.id) {
        await ffHub.send({
          content: `🔫 🏆 **NEW Free Fire 3-Map Tournament Hosted by Admin <@${member.id}>!**\n\n` +
            `• **Event:** **${title}**\n` +
            `• **🗺️ Maps (Play 3 Times):** \`Match 1: Bermuda \| Match 2: Purgatory \| Match 3: Kalahari\`\n` +
            `• **Format & Capacity:** \`${isSquad ? '12 Squads (48 Players Total)' : '24 Duos (48 Players Total)'}\`\n` +
            `• **Entry Fee:** \`${entryFee}\`\n` +
            `• **Prize Pool:** \`${prizePool}\`\n\n` +
            `👉 Head over to <#${dashboardChannel.id}> to register before slots fill up!`
        }).catch(() => null);
      }

      await paymentHandler.updatePaymentDesk(guild);

      return interaction.editReply({
        content: `🎉 **Free Fire 3-Map ${isSquad ? '12-Squad' : '24-Duo'} Tournament #${result.tournamentId} Successfully Hosted!**\n\n` +
          `• **Title:** ${title}\n` +
          `• **🗺️ Format:** 3 Maps / Play 3 Times (Bermuda, Purgatory, Kalahari)\n` +
          `• **Capacity:** ${maxParticipants} ${isSquad ? 'Squads (4 players each = 48 players total)' : 'Duos (2 players each = 48 players total)'}\n` +
          `• **Entry Fee:** ${entryFee}\n` +
          `• **Prize Pool:** ${prizePool}\n` +
          `• **Live Dashboard & QR Code:** Posted in <#${dashboardChannel.id}>\n` +
          `• **Live Scoreboard & 3-Map Standings:** Posted in <#${result.tournament.scores_channel_id || result.tournament.scoreboard_channel_id}>\n` +
          `• **Event Channels:** <#${result.announcementsChannel.id}>, <#${result.chatChannel.id}>, <#${result.voiceLounge.id}>\n\n` +
          `*Teams can now scan the QR code to register and submit payment!*`
      });
    }

    if (subcommand === 'host-efootball') {
      await interaction.deferReply({ ephemeral: true });

      const customTitle = interaction.options.getString('title');
      const title = customTitle || 'eFootball ₹1,500 Instant Cash Cup (8 Players)';
      const maxParticipants = 8;
      const entryFee = '₹250 (GPay / PhonePe / Paytm UPI)';
      const prizePool = '🥇 1st Prize: ₹1,500 Instant Money (Direct UPI Payout to Winner)';
      const rules = '• 8 Players Single Elimination Knockout (1v1)\n• Match duration: 10 mins (Extra Time + PK if draw)\n• 🥇 Winner takes ₹1,500 Instant Cash Prize!\n• Slots are confirmed only after ₹250 payment verification!';
      
      // Default to #active-tournaments or efootball channel or current channel
      let dashboardChannel = interaction.options.getChannel('dashboard_channel');
      if (!dashboardChannel) {
        dashboardChannel = guild.channels.cache.find(c => c.name === 'efootball-registration' || c.name === '📝-efootball-registration' || c.name === 'efootball-announcements' || c.name === '📢-efootball-announcements' || c.name === 'active-tournaments' || c.name === '🏆-active-tournaments') || interaction.channel;
      }

      const gpayInfo = `UPI ID: sinoprince366-1@okhdfcbank\nAmount: ₹250\nScan QR Code on Dashboard to pay`;

      const result = await tournamentHandler.createTournament(guild, member, {
        title,
        game: 'eFootball',
        mode: 'solo',
        maxParticipants,
        entryFee,
        prizePool,
        gpayInfo,
        rulesText: rules,
        dashboardChannel
      });

      if (!result.success) {
        return interaction.editReply({ content: `❌ Failed to create tournament: ${result.error}` });
      }

      // Also announce in #efootball-chat / #efootball channel if available
      const efootballHub = guild.channels.cache.find(c => c.name === 'efootball' || c.name === '⚽-efootball' || c.name === 'efootball-announcements');
      if (efootballHub && efootballHub.id !== dashboardChannel.id) {
        await efootballHub.send({
          content: `⚽ 🏆 **NEW eFootball Tournament Hosted by Admin <@${member.id}>!**\n\n` +
            `• **Event:** **${title}**\n` +
            `• **Player Slots:** \`8 Players Max\`\n` +
            `• **Entry Fee:** \`₹250\`\n` +
            `• **🥇 1st Prize:** \`₹1,500 Instant Money\`\n\n` +
            `👉 Head over to <#${dashboardChannel.id}> to scan the QR code and register before slots fill up!`
        }).catch(() => null);
      }

      // Update Payment Desk in #💳-payment-desk to reflect the newly active tournament
      await paymentHandler.updatePaymentDesk(guild);

      return interaction.editReply({
        content: `🎉 **eFootball 8-Player Tournament #${result.tournamentId} Successfully Hosted!**\n\n` +
          `• **Title:** ${title}\n` +
          `• **Slots:** 8 Players\n` +
          `• **Entry Fee:** ₹250\n` +
          `• **🥇 1st Prize:** ₹1,500 Instant Money\n` +
          `• **Live Dashboard & ₹250 QR Code:** Posted in <#${dashboardChannel.id}>\n` +
          `• **Live Scoreboard & Bracket:** Posted in <#${result.tournament.scores_channel_id || result.tournament.scoreboard_channel_id}>\n` +
          `• **Event Channels:** <#${result.announcementsChannel.id}>, <#${result.chatChannel.id}>, <#${result.voiceLounge.id}>\n\n` +
          `*Players can now scan the QR code to submit ₹250 payment and claim their slot!*`
      });
    }

    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });

      const game = interaction.options.getString('game');
      const title = interaction.options.getString('title');
      const maxParticipants = interaction.options.getInteger('max_participants');
      const entryFee = interaction.options.getString('entry_fee');
      const prizePool = interaction.options.getString('prize_pool');
      const rules = interaction.options.getString('rules') || 'Standard tournament competitive rules apply.';
      const dashboardChannel = interaction.options.getChannel('dashboard_channel') || interaction.channel;

      const gpayEnv = `UPI ID: sinoprince366-1@okhdfcbank\nScan QR Code on Dashboard to pay`;
      const gpayInfo = interaction.options.getString('gpay_info') || gpayEnv;

      const result = await tournamentHandler.createTournament(guild, member, {
        title,
        game,
        maxParticipants,
        entryFee,
        prizePool,
        gpayInfo,
        rulesText: rules,
        dashboardChannel
      });

      if (!result.success) {
        return interaction.editReply({ content: `❌ Failed to create tournament: ${result.error}` });
      }

      // Update Payment Desk
      await paymentHandler.updatePaymentDesk(guild);

      return interaction.editReply({
        content: `🎉 **Tournament #${result.tournamentId} Successfully Created!**\n\n` +
          `• **Title:** ${title} (${game})\n` +
          `• **Slots:** ${maxParticipants}\n` +
          `• **Dashboard Embed & QR Code:** Posted in <#${dashboardChannel.id}>\n` +
          `• **Category:** \`${result.category.name}\`\n` +
          `• **Announcements:** <#${result.announcementsChannel.id}>\n` +
          `• **Match Chat:** <#${result.chatChannel.id}>\n` +
          `• **Voice Lounge:** <#${result.voiceLounge.id}>\n\n` +
          `*Players can now scan the QR code to pay and register!*`
      });
    }

    if (subcommand === 'scoreboard') {
      await interaction.deferReply({ ephemeral: true });

      const id = interaction.options.getInteger('id');
      const round = interaction.options.getString('round');
      const player1 = interaction.options.getString('player1');
      const player2 = interaction.options.getString('player2');
      const score = interaction.options.getString('score');
      const winner = interaction.options.getString('winner');

      const res = await tournamentHandler.updateScoreboard(
        interaction.client,
        id,
        round,
        player1,
        player2,
        score,
        winner,
        member
      );

      if (!res.success) {
        return interaction.editReply({ content: `❌ ${res.message}` });
      }

      return interaction.editReply({ content: res.message });
    }

    if (subcommand === 'scoreboard-view') {
      let id = interaction.options.getInteger('id');
      if (!id) {
        const active = dbQueries.getActiveTournaments(guild.id);
        if (active.length > 0) {
          id = active[0].id;
        } else {
          return interaction.reply({
            content: 'ℹ️ No active tournaments found. Please specify a tournament ID: `/tournament scoreboard-view <id>`',
            ephemeral: true
          });
        }
      }

      const tourney = dbQueries.getTournament(id);
      if (!tourney || tourney.guild_id !== guild.id) {
        return interaction.reply({ content: `❌ Tournament with ID \`#${id}\` was not found.`, ephemeral: true });
      }

      const confirmed = dbQueries.getConfirmedParticipants(id);
      const scores = dbQueries.getScoreboard(id);
      const payload = embedBuilder.createTournamentScoreboardEmbed(tourney, confirmed, scores);

      return interaction.reply({ ...payload, ephemeral: false });
    }

    if (subcommand === 'list') {
      const active = dbQueries.getActiveTournaments(guild.id);
      if (active.length === 0) {
        return interaction.reply({
          content: 'ℹ️ There are currently no active open tournaments. Admins can create one using `/tournament create`!',
          ephemeral: true
        });
      }

      const listStr = active.map(t => {
        const count = dbQueries.getParticipantCount(t.id);
        return `• **[#${t.id}] ${t.title}** (${t.game}) — Confirmed: \`${count}/${t.max_participants}\` | Fee: \`${t.entry_fee}\``;
      }).join('\n');

      return interaction.reply({
        content: `🏆 **Active Tournaments in ${guild.name}:**\n\n${listStr}\n\n*Use \`/tournament info <id>\` for full details.*`,
        ephemeral: true
      });
    }

    if (subcommand === 'info') {
      const id = interaction.options.getInteger('id');
      const tourney = dbQueries.getTournament(id);
      if (!tourney || tourney.guild_id !== guild.id) {
        return interaction.reply({ content: `❌ Tournament with ID \`#${id}\` was not found.`, ephemeral: true });
      }

      const confirmed = dbQueries.getConfirmedParticipants(id);
      const pending = dbQueries.getPendingParticipants(id);
      const payload = embedBuilder.createTournamentDashboardEmbed(tourney, confirmed, pending.length);

      return interaction.reply({ ...payload, ephemeral: true });
    }

    if (subcommand === 'end') {
      await interaction.deferReply({ ephemeral: true });
      const id = interaction.options.getInteger('id');
      const winner = interaction.options.getString('winner_announcement');
      const deleteChannels = interaction.options.getBoolean('delete_channels') || false;

      const res = await tournamentHandler.closeTournament(interaction.client, id, member, winner, deleteChannels);
      if (!res.success) {
        return interaction.editReply({ content: `❌ ${res.message}` });
      }

      // Update Payment Desk to reflect tournament closure
      await paymentHandler.updatePaymentDesk(guild);

      return interaction.editReply({
        content: `✅ ${res.message}\n` +
          (deleteChannels ? '🧹 Event channels and category were cleaned up.' : '📁 Event channels preserved for match archives.')
      });
    }

    if (subcommand === 'start') {
      await interaction.deferReply({ ephemeral: true });
      const id = interaction.options.getInteger('id');
      const res = await tournamentHandler.startTournament(interaction.client, id, member);
      return interaction.editReply({ content: res.message });
    }

    if (subcommand === 'kick') {
      const id = interaction.options.getInteger('id');
      const targetUser = interaction.options.getUser('user');

      const tourney = dbQueries.getTournament(id);
      if (!tourney) {
        return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
      }

      const removed = dbQueries.removeParticipant(id, targetUser.id);
      if (!removed) {
        return interaction.reply({ content: `❌ User <@${targetUser.id}> is not registered in tournament #${id}.`, ephemeral: true });
      }

      await tournamentHandler.refreshDashboard(interaction.client, id);
      await tournamentHandler.refreshTournamentScoreboard(interaction.client, id);
      await tournamentHandler.notifySlotAvailable(interaction.client, id);

      return interaction.reply({
        content: `✅ Removed <@${targetUser.id}> from tournament **#${id} (${tourney.title})**. A slot has been released back to the balance and an alert was sent to the registration channel!`,
        ephemeral: true
      });
    }
  }
};
