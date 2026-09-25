const { ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { dbQueries } = require('../database/db');
const embedBuilder = require('../utils/embedBuilder');
const paymentBotService = require('../utils/paymentBotService');
const config = require('../../config.json');

const tournamentHandler = {
  /**
   * Creates a new tournament with clean, uncluttered channels:
   * 1. #{game}-announcements (Public read-only, Admin/Bot post only)
   * 2. #match-chat (Private for registered participants & Admins)
   * 3. #tournament-lounge (Private voice for registered participants & Admins)
   */
  createTournament: async (guild, creatorMember, options) => {
    let {
      title,
      game,
      maxParticipants,
      entryFee,
      prizePool,
      gpayInfo,
      rulesText,
      dashboardChannel,
      mode
    } = options;

    try {
      await guild.roles.fetch().catch(() => null);

      // 1. Create Tournament Roles
      // A. Confirmed Tournament Role
      const tournamentRole = await guild.roles.create({
        name: `🏆 ${title}`.substring(0, 95),
        color: '#FFA500',
        reason: `Auto-created role for confirmed participants of ${title}`,
        permissions: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks
        ]
      });

      // B. Tournament Pending Role
      const pendingRole = await guild.roles.create({
        name: `⏳ ${title} (Pending)`.substring(0, 95),
        color: '#95A5A6',
        reason: `Auto-created role for pending payment approval in ${title}`,
        permissions: []
      });

      // C. Ensure Tournament Host Role
      let hostRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'tournament host' || r.name.toLowerCase() === 'host');
      if (!hostRole) {
        hostRole = await guild.roles.create({
          name: '👑 Tournament Host',
          color: '#F1C40F',
          reason: 'Role for tournament creators & organizers',
          permissions: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.MuteMembers,
            PermissionsBitField.Flags.MoveMembers
          ]
        });
      }

      // Assign Host role to creator
      await creatorMember.roles.add(hostRole).catch(() => null);
      await creatorMember.roles.add(tournamentRole).catch(() => null);

      // Find Admin roles
      const adminRole = guild.roles.cache.find(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase());

      // Permission Overwrites for Private Participant Channels
      const participantOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect
          ]
        },
        {
          id: tournamentRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak
          ]
        },
        {
          id: creatorMember.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.PrioritySpeaker
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
        participantOverwrites.push({
          id: adminRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.PrioritySpeaker
          ]
        });
      }

      // 2. Locate or Create Category for this game
      const gameDef = (config.gameRoles || []).find(g => 
        g.name.toLowerCase() === game.toLowerCase() ||
        g.key.toLowerCase() === game.toLowerCase() ||
        (game || '').toLowerCase().includes(g.key) ||
        (game || '').toLowerCase().includes(g.name.toLowerCase())
      );

      let category = null;
      if (gameDef) {
        category = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildCategory && (
            c.name.toLowerCase() === (gameDef.categoryName || '').toLowerCase() ||
            c.name.toLowerCase().includes(gameDef.key.replace('_', ' ')) ||
            c.name.toLowerCase().includes(gameDef.name.toLowerCase())
          )
        );
      }
      if (!category) {
        category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('tournament'));
      }
      if (!category) {
        category = await guild.channels.create({
          name: `🏆 ╎ ${title}`.substring(0, 95),
          type: ChannelType.GuildCategory
        });
      }

      // Format game-specific channel names
      const gameClean = game.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      const targetRegName = gameDef?.registrationChannel || `📝-${gameClean}-registration`;
      const targetAnnName = gameDef?.announcementChannel || `📢-${gameClean}-announcements`;
      const targetScoreName = gameDef?.scoreboardChannel || `📊-${gameClean}-scoreboard`;

      // 3. Registration Channel (Read-Only for Members, Admin/Bot Post Only)
      let registrationChannel = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && (
          (category && c.parentId === category.id && (c.name === targetRegName || c.name.includes('registration') || c.name.includes('📝'))) ||
          c.name === targetRegName
        )
      );

      if (!registrationChannel) {
        registrationChannel = await guild.channels.create({
          name: targetRegName,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `Official tournament registration desk, dashboards, and live slot alerts for ${game}`,
          permissionOverwrites: publicAnnOverwrites
        });
      }

      if (!dashboardChannel) {
        dashboardChannel = registrationChannel;
      }

      // 4. Announcements Channel (Read-Only for Everyone, Admin/Bot Post Only)
      const publicAnnOverwrites = [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
          deny: [
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.SendMessagesInThreads,
            PermissionsBitField.Flags.CreatePublicThreads,
            PermissionsBitField.Flags.CreatePrivateThreads
          ]
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.ManageMessages
          ]
        }
      ];
      if (adminRole) {
        publicAnnOverwrites.push({
          id: adminRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles
          ]
        });
      }

      let announcementsChannel = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && (
          (category && c.parentId === category.id && (c.name === targetAnnName || c.name.includes('announcement') || c.name.includes('📢'))) ||
          c.name === targetAnnName
        )
      );

      if (!announcementsChannel) {
        announcementsChannel = await guild.channels.create({
          name: targetAnnName,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `Official match announcements & live updates for ${title}`,
          permissionOverwrites: publicAnnOverwrites
        });
      }

      // 4. Scoreboard Channel for live brackets and standings
      let scoreboardChannel = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && (
          (category && c.parentId === category.id && (c.name === targetScoreName || c.name.includes('scoreboard') || c.name.includes('📊'))) ||
          c.name === targetScoreName
        )
      );

      if (!scoreboardChannel) {
        scoreboardChannel = await guild.channels.create({
          name: targetScoreName,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `Live match scores, brackets, and standings for ${title}`,
          permissionOverwrites: publicAnnOverwrites
        });
      }

      // 5. Private #match-chat for participants
      let chatChannel = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && (
          (category && c.parentId === category.id && (c.name === 'match-chat' || (gameDef && c.name === gameDef.textChannel)))
        )
      );

      if (!chatChannel) {
        chatChannel = await guild.channels.create({
          name: `match-chat`,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `Match discussion & coordination for ${title}`,
          permissionOverwrites: participantOverwrites
        });
      }

      // 6. Voice Channels: Dedicated Team Voice Lounges & Match Room
      const voiceChannelIds = [];
      const numTeamVoiceRooms = mode === 'squad' ? 6 : (mode === 'duo' ? 4 : 2);

      let voiceLounge = await guild.channels.create({
        name: `🔊 Tournament Lounge`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: participantOverwrites
      }).catch(() => null);

      if (voiceLounge) voiceChannelIds.push(voiceLounge.id);

      for (let i = 1; i <= numTeamVoiceRooms; i++) {
        const teamVoice = await guild.channels.create({
          name: `🔊 Team ${i} Voice`,
          type: ChannelType.GuildVoice,
          parent: category.id,
          userLimit: mode === 'squad' ? 4 : (mode === 'duo' ? 2 : 5),
          permissionOverwrites: participantOverwrites
        }).catch(() => null);
        if (teamVoice) voiceChannelIds.push(teamVoice.id);
      }


      // 7. Save to Database
      const tournamentId = dbQueries.createTournament({
        guild_id: guild.id,
        title,
        game,
        mode: mode || (title.toLowerCase().includes('duo') ? 'duo' : (title.toLowerCase().includes('squad') ? 'squad' : 'solo')),
        max_participants: maxParticipants,
        entry_fee: entryFee,
        prize_pool: prizePool,
        gpay_info: gpayInfo,
        rules_text: rulesText,
        status: 'OPEN',
        dashboard_channel_id: dashboardChannel.id,
        category_id: category.id,
        announcements_channel_id: announcementsChannel.id,
        chat_channel_id: chatChannel.id,
        scores_channel_id: scoreboardChannel.id,
        voice_channel_ids: voiceChannelIds,
        tournament_role_id: tournamentRole.id,
        pending_role_id: pendingRole.id,
        created_by: creatorMember.id
      });

      const tournament = dbQueries.getTournament(tournamentId);

      // 8. Post Interactive Dashboard in the Registration Channel
      const dashboardPayload = embedBuilder.createTournamentDashboardEmbed(tournament, []);
      const dashboardMessage = await dashboardChannel.send(dashboardPayload);

      // Determine accurate format label & team unit
      const effectiveMode = mode || (game.toLowerCase().includes('efootball') ? 'solo' : (title.toLowerCase().includes('duo') ? 'duo' : (title.toLowerCase().includes('squad') ? 'squad' : 'solo')));
      const formatLabel = effectiveMode === 'duo'
        ? 'Duo (2 Players per Team)'
        : (effectiveMode === 'squad'
            ? 'Squad (4 Players per Team)'
            : (effectiveMode === '5v5' || game.toLowerCase().includes('valorant')
                ? '5v5 (5 Players per Team)'
                : 'Solo (1v1 Knockout)'));
      const teamUnit = effectiveMode === 'duo' ? 'Duo Teams' : (effectiveMode === 'squad' || effectiveMode === '5v5' || game.toLowerCase().includes('valorant') ? 'Teams' : 'Players / Teams');

      // Post Registration Open Alert directly in the Registration Channel
      await dashboardChannel.send({
        content: `🚨 🏆 **REGISTRATION IS NOW OPEN FOR ${title}!**\n` +
          `• **Game & Format:** \`${game} — ${formatLabel}\`\n` +
          `• **Entry Fee:** \`${entryFee}\`\n` +
          `• **Prize Pool:** \`${prizePool}\`\n` +
          `• **Total Allowed Teams:** \`${maxParticipants} ${teamUnit}\`\n` +
          `• ⚡ **Balance Teams That Can Join:** \`${maxParticipants} ${teamUnit} available\` (0/${maxParticipants} registered)\n\n` +
          `👉 Click the **"Register for Tournament"** button on the dashboard above to submit your team details and claim your slot!`
      }).catch(() => null);

      // 9. Post Live Scoreboard Embed in #📊-scoreboard
      const initialScoreboard = embedBuilder.createTournamentScoreboardEmbed(tournament, [], []);
      const scoreboardMsg = await scoreboardChannel.send(initialScoreboard);

      // 10. Post Welcome Announcement in Game Announcements Channel
      if (announcementsChannel && announcementsChannel.id !== dashboardChannel.id) {
        await announcementsChannel.send({
          content: `🎉 🏆 **NEW TOURNAMENT ANNOUNCEMENT: ${title}**\n` +
            `• Role: <@&${tournamentRole.id}>\n` +
            `• 📝 **Registration Desk:** <#${dashboardChannel.id}>\n` +
            `• 📊 **Live Scoreboard:** <#${scoreboardChannel.id}>\n\n` +
            `👉 Head over to <#${dashboardChannel.id}> to register before slots fill up!`
        }).catch(() => null);
      }

      // Update tournament record with dashboard & scoreboard message IDs
      dbQueries.updateTournament(tournamentId, {
        dashboard_message_id: dashboardMessage.id,
        scoreboard_channel_id: scoreboardChannel.id,
        scoreboard_message_id: scoreboardMsg.id
      });

      return {
        success: true,
        tournamentId,
        tournament,
        tournamentRole,
        pendingRole,
        category,
        announcementsChannel,
        chatChannel,
        voiceLounge
      };
    } catch (err) {
      console.error('[TournamentManager] Error creating tournament:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Refreshes the tournament dashboard embed with confirmed participant lists and state.
   */
  refreshDashboard: async (client, tournamentId) => {
    try {
      const tournament = dbQueries.getTournament(tournamentId);
      if (!tournament || !tournament.dashboard_channel_id || !tournament.dashboard_message_id) return;

      const channel = await client.channels.fetch(tournament.dashboard_channel_id).catch(() => null);
      if (!channel) return;

      const message = await channel.messages.fetch(tournament.dashboard_message_id).catch(() => null);
      if (!message) return;

      const confirmed = dbQueries.getConfirmedParticipants(tournamentId);
      const pending = dbQueries.getPendingParticipants(tournamentId);
      const payload = embedBuilder.createTournamentDashboardEmbed(tournament, confirmed, pending.length);

      if (message.author.id === client.user.id) {
        await message.edit(payload);
      } else {
        const { REST, Routes } = require('discord.js');
        const token = process.env.DISCORD_TOKEN;
        if (token) {
          const mainRest = new REST({ version: '10' }).setToken(token);
          const body = {};
          if (payload.embeds) body.embeds = payload.embeds.map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e));
          if (payload.components) body.components = payload.components.map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c));
          await mainRest.patch(Routes.channelMessage(tournament.dashboard_channel_id, tournament.dashboard_message_id), { body }).catch(err => {
            console.error('[TournamentManager] Failed to patch dashboard message via REST:', err.message);
          });
        }
      }
    } catch (err) {
      console.error(`[TournamentManager] Error refreshing dashboard for #${tournamentId}:`, err);
    }
  },

  /**
   * Handles user submitting registration & payment reference for a tournament.
   */
  registerUser: async (client, tournamentId, member, ingameId, paymentRef = 'None', squadName = 'Solo') => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found or has been deleted.' };
    }

    if (tournament.status !== 'OPEN') {
      return { success: false, message: `This tournament is currently \`${tournament.status}\` and not accepting registrations.` };
    }

    if (dbQueries.isParticipant(tournamentId, member.id)) {
      return { success: false, message: 'You have already submitted a registration for this tournament!' };
    }

    const currentCount = dbQueries.getParticipantCount(tournamentId);
    if (currentCount >= tournament.max_participants) {
      return { success: false, message: 'Sorry, this tournament has reached its maximum participant limit!' };
    }

    try {
      // 1. Assign Pending Role to Member
      if (tournament.pending_role_id) {
        const pendingRole = member.guild.roles.cache.get(tournament.pending_role_id);
        if (pendingRole) {
          await member.roles.add(pendingRole, 'Tournament registration submitted: assigned pending role').catch(() => null);
        }
      }

      // 2. Add Participant to DB with PENDING status & squad name
      dbQueries.addParticipant(tournamentId, member.id, member.user.username, ingameId, 'PENDING', paymentRef, squadName);
      await tournamentHandler.refreshDashboard(client, tournamentId);

      return {
        success: true,
        message: '✅ **Registration submitted!** Check your Direct Messages (DM) with **PLE Payments Bot** to complete payment and confirm your slot.'
      };


    } catch (err) {
      console.error(`[TournamentManager] Error registering user ${member.id}:`, err);
      return { success: false, message: `Registration failed: ${err.message}` };
    }
  },

  /**
   * Approves a player's payment (Admin / Host only), grants tournament role and channel access.
   */
  approvePayment: async (client, tournamentId, userId, adminMember) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    const guild = adminMember.guild;
    const targetMember = await guild.members.fetch(userId).catch(() => null);

    try {
      // 1. Update Database to CONFIRMED
      dbQueries.approveParticipant(tournamentId, userId);

      // 2. Remove Pending Role & Add Confirmed Tournament Role
      if (targetMember) {
        if (tournament.pending_role_id) {
          const pendingRole = guild.roles.cache.get(tournament.pending_role_id);
          if (pendingRole && targetMember.roles.cache.has(pendingRole.id)) {
            await targetMember.roles.remove(pendingRole, 'Payment approved: removed pending role').catch(() => null);
          }
        }

        if (tournament.tournament_role_id) {
          const tourneyRole = guild.roles.cache.get(tournament.tournament_role_id);
          if (tourneyRole) {
            await targetMember.roles.add(tourneyRole, 'Payment approved: assigned confirmed tournament role').catch(() => null);
          }
        }

        // Send DM to Player from Payment Bot
        await paymentBotService.sendDm(
          userId,
          {
            content: `🎉 **Payment Approved!** You are now officially registered for **${tournament.title}** in **${guild.name}**!\n` +
              `You now have full access to <#${tournament.chat_channel_id}> and the tournament lounge.`
          },
          client
        );
      }

      // 3. Refresh Dashboard
      await tournamentHandler.refreshDashboard(client, tournamentId);

      // 4. Welcome in Match Chat
      if (tournament.chat_channel_id) {
        const chatChan = await client.channels.fetch(tournament.chat_channel_id).catch(() => null);
        if (chatChan) {
          await chatChan.send({
            content: `🎮 Welcome confirmed player <@${userId}> to **${tournament.title}**! Match chat is now unlocked for you.`
          });
        }
      }

      // 3. Update persistent scoreboard in #📊-scoreboard
      await tournamentHandler.refreshTournamentScoreboard(client, tournamentId);

      // 4. Post Slot Reserved & Confirmed Notification in the Registration Channel
      if (tournament.dashboard_channel_id) {
        const regChan = await client.channels.fetch(tournament.dashboard_channel_id).catch(() => null);
        if (regChan) {
          const participant = dbQueries.getParticipants(tournamentId).find(p => p.user_id === userId);
          const confirmedCount = dbQueries.getConfirmedParticipants(tournamentId).length;
          const maxSlots = tournament.max_participants || 25;
          const balanceSlots = Math.max(0, maxSlots - confirmedCount);
          const teamDisplay = participant?.squad_name || participant?.team_name || 'Solo';
          const ignDisplay = participant?.ingame_id || participant?.in_game_id || 'N/A';

          await regChan.send({
            content: `🎉 🎟️ **SLOT RESERVED & CONFIRMED!**\n` +
              `• **Tournament:** \`${tournament.title || tournament.name}\`\n` +
              `• **Team / Duo:** **${teamDisplay}** (<@${userId}>)\n` +
              `• **In-Game ID / IGN:** \`${ignDisplay}\`\n` +
              `• **Slot Status:** \`✅ CONFIRMED & RESERVED\`\n` +
              `• ⚡ **Balance Slots Remaining:** \`${balanceSlots} slots left\` (${confirmedCount}/${maxSlots} confirmed)\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          }).catch(() => null);
        }
      }

      return {
        success: true,
        message: `✅ <@${userId}>'s payment has been **approved**! Granted <@&${tournament.tournament_role_id}> role and channel access.`
      };
    } catch (err) {
      console.error(`[TournamentManager] Error approving payment for user ${userId}:`, err);
      return { success: false, message: `Failed to approve payment: ${err.message}` };
    }
  },

  /**
   * Rejects a player's registration / payment.
   */
  rejectPayment: async (client, tournamentId, userId, adminMember) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) return { success: false, message: 'Tournament not found.' };

    const guild = adminMember.guild;
    const targetMember = await guild.members.fetch(userId).catch(() => null);

    try {
      dbQueries.removeParticipant(tournamentId, userId);

      if (targetMember) {
        if (tournament.pending_role_id) {
          const pendingRole = guild.roles.cache.get(tournament.pending_role_id);
          if (pendingRole && targetMember.roles.cache.has(pendingRole.id)) {
            await targetMember.roles.remove(pendingRole, 'Registration rejected by admin').catch(() => null);
          }
        }
        if (tournament.tournament_role_id) {
          const tourneyRole = guild.roles.cache.get(tournament.tournament_role_id);
          if (tourneyRole && targetMember.roles.cache.has(tourneyRole.id)) {
            await targetMember.roles.remove(tourneyRole, 'Registration rejected by admin').catch(() => null);
          }
        }

        await paymentBotService.sendDm(
          userId,
          {
            content: `❌ Your registration / payment for **${tournament.title}** was rejected by the organizers.`
          },
          client
        );
      }

      await tournamentHandler.refreshDashboard(client, tournamentId);
      await tournamentHandler.refreshTournamentScoreboard(client, tournamentId);
      await tournamentHandler.notifySlotAvailable(client, tournamentId);
      return { success: true, message: `❌ Registration for <@${userId}> was **rejected** and removed.` };
    } catch (err) {
      return { success: false, message: `Failed to reject: ${err.message}` };
    }
  },

  /**
   * Scoreboard Management System:
   * Adds match score & winner, updates persistent scoreboard, and broadcasts to announcements & match-chat!
   */
  updateScoreboard: async (client, tournamentId, round, player1, player2, score, winner, adminMember) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    try {
      // 1. Record entry in Database
      const entry = dbQueries.addScoreboardEntry({
        tournament_id: tournamentId,
        round_name: round,
        player1,
        player2,
        score,
        winner,
        updated_by: adminMember.id
      });

      // 2. Refresh persistent Live Scoreboard in #📊-scoreboard
      await tournamentHandler.refreshTournamentScoreboard(client, tournamentId);

      // 3. Broadcast result to Game Announcements Channel
      if (tournament.announcements_channel_id) {
        const annChan = await client.channels.fetch(tournament.announcements_channel_id).catch(() => null);
        if (annChan) {
          const scoreboardPayload = embedBuilder.createScoreboardEmbed(
            tournament,
            round,
            player1,
            player2,
            score,
            winner,
            adminMember.user
          );
          await annChan.send(scoreboardPayload);
        }
      }

      // 4. Also notify in Match Chat
      const matchDisplay = player2 ? `**${player1}** vs **${player2}**` : `**${player1}**`;
      if (tournament.chat_channel_id) {
        const chatChan = await client.channels.fetch(tournament.chat_channel_id).catch(() => null);
        if (chatChan) {
          await chatChan.send({
            content: `📢 **Scoreboard Update:** \`${round}\` — ${matchDisplay} | Score: \`${score}\` | 🏆 Winner: **${winner}**`
          });
        }
      }

      return {
        success: true,
        message: `✅ **Scoreboard Updated & Broadcasted!**\n` +
          `• **Round:** \`${round}\`\n` +
          `• **Competitor(s):** ${player2 ? `${player1} vs ${player2}` : player1}\n` +
          `• **Score:** \`${score}\`\n` +
          `• **Winner:** 🏆 **${winner}**\n` +
          `• **Live Scoreboard:** <#${tournament.scores_channel_id || tournament.scoreboard_channel_id}>\n` +
          `• **Broadcasted to:** <#${tournament.announcements_channel_id}>`
      };
    } catch (err) {
      console.error('[ScoreboardManager] Error updating scoreboard:', err);
      return { success: false, message: `Failed to update scoreboard: ${err.message}` };
    }
  },

  /**
   * Deletes a match record and refreshes the live scoreboard in Discord.
   */
  deleteScoreboardEntry: async (client, tournamentId, entryId) => {
    try {
      const deleted = dbQueries.deleteScoreboardEntry(entryId);
      if (!deleted) return { success: false, message: 'Scoreboard entry not found.' };

      await tournamentHandler.refreshTournamentScoreboard(client, tournamentId);
      return { success: true, message: 'Scoreboard entry removed and Discord scoreboard updated!' };
    } catch (err) {
      console.error('[ScoreboardManager] Error removing entry:', err);
      return { success: false, message: err.message };
    }
  },

  /**
   * Refreshes the persistent live scoreboard & bracket embed in #📊-scoreboard.
   */
  refreshTournamentScoreboard: async (client, tournamentId) => {
    try {
      const tournament = dbQueries.getTournament(tournamentId);
      if (!tournament) return false;

      const confirmed = dbQueries.getConfirmedParticipants(tournamentId);
      const scores = dbQueries.getScoreboard(tournamentId);
      const payload = embedBuilder.createTournamentScoreboardEmbed(tournament, confirmed, scores);

      const channelId = tournament.scoreboard_channel_id || tournament.scores_channel_id;
      if (channelId && tournament.scoreboard_message_id) {
        const chan = await client.channels.fetch(channelId).catch(() => null);
        if (chan) {
          const msg = await chan.messages.fetch(tournament.scoreboard_message_id).catch(() => null);
          if (msg) {
            if (msg.author.id === client.user.id) {
              await msg.edit(payload).catch(() => null);
            } else {
              const { REST, Routes } = require('discord.js');
              const token = process.env.DISCORD_TOKEN;
              if (token) {
                const mainRest = new REST({ version: '10' }).setToken(token);
                const body = {};
                if (payload.embeds) body.embeds = payload.embeds.map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e));
                if (payload.components) body.components = payload.components.map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c));
                await mainRest.patch(Routes.channelMessage(channelId, tournament.scoreboard_message_id), { body }).catch(() => null);
              }
            }
            return true;
          }
        }
      }
      return false;
    } catch (err) {
      console.error('[ScoreboardManager] Error refreshing live scoreboard embed:', err);
      return false;
    }
  },

  /**
   * Handles user leaving/canceling registration.
   */
  unregisterUser: async (client, tournamentId, member) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    if (!dbQueries.isParticipant(tournamentId, member.id)) {
      return { success: false, message: 'You are not registered in this tournament.' };
    }

    if (tournament.status !== 'OPEN') {
      return { success: false, message: 'Cannot leave a tournament that has already started or ended.' };
    }

    try {
      dbQueries.removeParticipant(tournamentId, member.id);

      if (tournament.tournament_role_id) {
        await member.roles.remove(tournament.tournament_role_id).catch(() => null);
      }
      if (tournament.pending_role_id) {
        await member.roles.remove(tournament.pending_role_id).catch(() => null);
      }

      await tournamentHandler.refreshDashboard(client, tournamentId);
      await tournamentHandler.notifySlotAvailable(client, tournamentId);

      return {
        success: true,
        message: `You have been unregistered from **${tournament.title}**.`
      };
    } catch (err) {
      console.error(`[TournamentManager] Error unregistering user:`, err);
      return { success: false, message: `Failed to unregister: ${err.message}` };
    }
  },

  /**
   * Closes an active tournament (Admins only) and cleans up roles/channels.
   */
  closeTournament: async (client, tournamentId, adminMember, winnerAnnouncement = null, deleteChannels = false) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    try {
      dbQueries.closeTournament(tournamentId, 'COMPLETED');
      await tournamentHandler.refreshDashboard(client, tournamentId);

      if (winnerAnnouncement) {
        if (tournament.announcements_channel_id) {
          const announcementsChannel = await client.channels.fetch(tournament.announcements_channel_id).catch(() => null);
          if (announcementsChannel) {
            await announcementsChannel.send({
              content: `🏁 **TOURNAMENT CONCLUDED** 🏁\n\n${winnerAnnouncement}\n\n*Closed by Admin <@${adminMember.id}>*`
            });
          }
        }

        // Also post in the main Game Hub channel (e.g. #⚽-efootball)
        const gameHub = adminMember.guild.channels.cache.find(
          c => c.name.toLowerCase().includes(tournament.game.toLowerCase().replace(' ', '-')) || c.name.toLowerCase().includes(tournament.game.toLowerCase())
        );
        if (gameHub && gameHub.id !== tournament.announcements_channel_id) {
          await gameHub.send({
            content: `🏆 **${tournament.title} CONCLUDED!**\n\n${winnerAnnouncement}\n\n*Official result confirmed by Admin <@${adminMember.id}>*`
          }).catch(() => null);
        }
      }

      if (deleteChannels) {
        const channelsToDelete = [
          tournament.announcements_channel_id,
          tournament.chat_channel_id,
          ...(tournament.voice_channel_ids || []),
          tournament.category_id
        ].filter(Boolean);

        for (const chanId of channelsToDelete) {
          const chan = await client.channels.fetch(chanId).catch(() => null);
          if (chan) {
            await chan.delete('Tournament ended and cleaned up by admin').catch(() => null);
          }
        }
      }

      // Automatically Delete Tournament Roles from Discord Server
      try {
        const targetGuild = (adminMember && adminMember.guild) || client.guilds.cache.get(tournament.guild_id) || client.guilds.cache.first();
        if (targetGuild) {
          await targetGuild.roles.fetch().catch(() => null);

          // 1. Delete Confirmed Tournament Role
          if (tournament.tournament_role_id) {
            const role = targetGuild.roles.cache.get(tournament.tournament_role_id);
            if (role) {
              await role.delete(`Tournament #${tournamentId} concluded and roles cleaned up`).catch(err => {
                console.warn(`[TournamentManager] Could not delete tournament role ${tournament.tournament_role_id}:`, err.message);
              });
              console.log(`[TournamentManager] Deleted tournament role: ${role.name} (${role.id})`);
            }
          }

          // 2. Delete Pending Tournament Role
          if (tournament.pending_role_id) {
            const pendingRole = targetGuild.roles.cache.get(tournament.pending_role_id);
            if (pendingRole) {
              await pendingRole.delete(`Tournament #${tournamentId} concluded and roles cleaned up`).catch(err => {
                console.warn(`[TournamentManager] Could not delete pending role ${tournament.pending_role_id}:`, err.message);
              });
              console.log(`[TournamentManager] Deleted pending role: ${pendingRole.name} (${pendingRole.id})`);
            }
          }
        }
      } catch (roleErr) {
        console.error(`[TournamentManager] Error deleting tournament roles for #${tournamentId}:`, roleErr.message);
      }

      return {
        success: true,
        message: `🏆 Tournament **#${tournamentId} (${tournament.title})** has been officially closed.`
      };
    } catch (err) {
      console.error(`[TournamentManager] Error closing tournament #${tournamentId}:`, err);
      return { success: false, message: `Failed to close tournament: ${err.message}` };
    }
  },

  /**
   * Starts a tournament (Admin only), locks registrations, and sends start notifications to registration & match channels.
   */
  startTournament: async (client, tournamentId, adminMember) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    if (tournament.status !== 'OPEN' && tournament.status !== 'ACTIVE' && tournament.status !== 'STARTED') {
      return { success: false, message: `Tournament #${tournamentId} cannot be started because its current status is \`${tournament.status}\`.` };
    }

    try {
      dbQueries.updateTournament(tournamentId, { status: 'STARTED' });
      await tournamentHandler.refreshDashboard(client, tournamentId);

      const startEmbed = new EmbedBuilder()
        .setColor('#00E676')
        .setTitle(`🚀 ⚔️ TOURNAMENT STARTED — ${tournament.title}`)
        .setDescription(
          `The tournament has officially begun! Matches and fixtures are now underway.\n\n` +
          `• **Status:** 🟢 \`Matches Underway\`\n` +
          `• **Registrations:** 🔒 \`Closed\`\n` +
          `• **Live Scoreboard & Brackets:** <#${tournament.scores_channel_id || tournament.scoreboard_channel_id}>\n` +
          `• **Match Chat:** <#${tournament.chat_channel_id}>\n\n` +
          `Good luck to all competing teams and players! Follow live standings on the scoreboard.`
        )
        .setFooter({ text: `${tournament.game} Tournament Division • Matches Active` })
        .setTimestamp();

      // 1. Post Start Alert in Registration Channel
      if (tournament.dashboard_channel_id) {
        const regChan = await client.channels.fetch(tournament.dashboard_channel_id).catch(() => null);
        if (regChan) {
          await regChan.send({
            content: `🚀 🏆 **THE TOURNAMENT HAS OFFICIALLY STARTED!** Registrations are now closed. Follow match progress below!`,
            embeds: [startEmbed]
          }).catch(() => null);
        }
      }

      // 2. Post in Announcements Channel
      if (tournament.announcements_channel_id && tournament.announcements_channel_id !== tournament.dashboard_channel_id) {
        const annChan = await client.channels.fetch(tournament.announcements_channel_id).catch(() => null);
        if (annChan) {
          await annChan.send({
            content: `⚔️ 🏆 **TOURNAMENT STARTED: ${tournament.title}**! Matches are now live.`,
            embeds: [startEmbed]
          }).catch(() => null);
        }
      }

      // 3. Post in Match Chat
      if (tournament.chat_channel_id) {
        const chatChan = await client.channels.fetch(tournament.chat_channel_id).catch(() => null);
        if (chatChan) {
          await chatChan.send({
            content: `🎮 🚨 **Attention Competitors!** **${tournament.title}** has officially started! Please check match fixtures on the scoreboard and coordinate with opponents here.`,
            embeds: [startEmbed]
          }).catch(() => null);
        }
      }

      return {
        success: true,
        message: `🚀 **Tournament #${tournamentId} (${tournament.title})** has officially started! Start alerts broadcast to registration desk and match channels.`
      };
    } catch (err) {
      console.error(`[TournamentManager] Error starting tournament #${tournamentId}:`, err);
      return { success: false, message: `Failed to start tournament: ${err.message}` };
    }
  },

  /**
   * Broadcasts a slot available notification to the registration channel when a slot opens up.
   */
  notifySlotAvailable: async (client, tournamentId) => {
    const tournament = dbQueries.getTournament(tournamentId);
    if (!tournament || tournament.status !== 'OPEN') return;

    const confirmed = dbQueries.getConfirmedParticipants(tournamentId);
    const slotsRemaining = Math.max(0, tournament.max_participants - confirmed.length);

    if (slotsRemaining <= 0) return;

    const mode = tournament.mode || (tournament.game?.toLowerCase().includes('efootball') ? 'solo' : (tournament.title.toLowerCase().includes('duo') ? 'duo' : (tournament.title.toLowerCase().includes('squad') ? 'squad' : 'solo')));
    const teamUnit = mode === 'duo' ? 'Duo Teams' : (mode === 'squad' || mode === '5v5' || tournament.game?.toLowerCase().includes('valorant') ? 'Teams' : 'Players / Teams');

    try {
      const regChanId = tournament.dashboard_channel_id;
      if (!regChanId) return;

      const regChan = await client.channels.fetch(regChanId).catch(() => null);
      if (!regChan) return;

      const slotEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle(`🎟️ ⚡ SLOT AVAILABLE ALERT — ${tournament.title}`)
        .setDescription(
          `A registration slot has just opened up in **${tournament.title}**!\n\n` +
          `• ⚡ **Balance Teams That Can Join:** \`${slotsRemaining} ${teamUnit} available\`\n` +
          `• **👥 Current Confirmed:** \`${confirmed.length} / ${tournament.max_participants} ${teamUnit}\`\n` +
          `• **💰 Entry Fee:** \`${tournament.entry_fee}\`\n\n` +
          `👉 **Hurry!** Head to the registration dashboard above and click **"Register for Tournament"** before the slot is claimed!`
        )
        .setFooter({ text: 'Slot Booking System • First Come, First Served' })
        .setTimestamp();

      await regChan.send({
        content: `📢 🎟️ **SLOT AVAILABLE!** A registration slot is now open for **${tournament.title}**! (${slotsRemaining} ${teamUnit} can still join)`,
        embeds: [slotEmbed]
      }).catch(() => null);
    } catch (err) {
      console.error(`[TournamentManager] Error notifying slot available for #${tournamentId}:`, err);
    }
  },

  /**
   * Automatically executes the 24-hour message purge and 48-hour scoreboard cleanup for closed tournaments.
   * - At 24 Hours post-closure: Purges all chats, registration messages, and announcement messages.
   * - At 48 Hours post-closure: Cleans up the scoreboard channel/embed once the 48h podium showcase finishes.
   */
  processClosedTournamentsCleanup: async (client) => {
    const data = dbQueries.getAllTournaments ? dbQueries.getAllTournaments() : [];
    const now = Date.now();
    const MS_24_HOURS = 24 * 60 * 60 * 1000;
    const MS_48_HOURS = 48 * 60 * 60 * 1000;

    for (const t of data) {
      if (t.status !== 'COMPLETED' && t.status !== 'CLOSED') continue;
      const closedAt = t.closed_at ? new Date(t.closed_at).getTime() : (t.updated_at ? new Date(t.updated_at).getTime() : 0);
      if (!closedAt) continue;

      const elapsed = now - closedAt;

      // 1. After 24 Hours: Delete messages in chat and announcements (leaving scoreboard intact)
      if (elapsed >= MS_24_HOURS && !t.messages_cleaned_24h) {
        console.log(`[AutoCleanup] 24 Hours elapsed for Tournament #${t.id} (${t.title}). Cleaning messages...`);
        const channelsToClean = [
          t.chat_channel_id,
          t.announcements_channel_id
        ].filter(Boolean);

        for (const chId of channelsToClean) {
          // Never clean the scoreboard channel during the 24h phase
          if (chId === t.scores_channel_id || chId === t.scoreboard_channel_id) continue;

          try {
            const chan = await client.channels.fetch(chId).catch(() => null);
            if (chan && typeof chan.bulkDelete === 'function') {
              const fetched = await chan.messages.fetch({ limit: 100 }).catch(() => null);
              if (fetched && fetched.size > 0) {
                // Delete messages (bulkDelete handles messages under 14 days old)
                await chan.bulkDelete(fetched, true).catch(async () => {
                  // Fallback for older messages
                  for (const m of fetched.values()) {
                    await m.delete().catch(() => null);
                  }
                });
              }
            }
          } catch (cleanErr) {
            console.warn(`[AutoCleanup] Error clearing messages in channel ${chId}:`, cleanErr.message);
          }
        }

        // Delete registration dashboard message from registration channel if present
        if (t.dashboard_channel_id && t.dashboard_message_id) {
          try {
            const regChan = await client.channels.fetch(t.dashboard_channel_id).catch(() => null);
            if (regChan) {
              const dashMsg = await regChan.messages.fetch(t.dashboard_message_id).catch(() => null);
              if (dashMsg) await dashMsg.delete().catch(() => null);
            }
          } catch (e) {
            // Ignore if already deleted
          }
        }

        dbQueries.updateTournament(t.id, { messages_cleaned_24h: true });
        console.log(`[AutoCleanup] ✅ 24h message purge finished for Tournament #${t.id}. Scoreboard remains active for podium showcase.`);
      }

      // 2. After 48 Hours: Clean up Scoreboard, all associated channels, and roles
      if (elapsed >= MS_48_HOURS && !t.channels_and_roles_cleaned_48h) {
        console.log(`[AutoCleanup] 48 Hours elapsed for Tournament #${t.id} (${t.title}). Automatically deleting all associated channels and roles...`);

        // A. Delete all associated tournament channels (chat, announcements, voice channels, and scoreboard)
        const channelsToDelete = [
          t.chat_channel_id,
          t.announcements_channel_id,
          t.scores_channel_id,
          t.scoreboard_channel_id,
          ...(t.voice_channel_ids || [])
        ].filter(Boolean);

        for (const chId of channelsToDelete) {
          try {
            const chan = await client.channels.fetch(chId).catch(() => null);
            if (chan) {
              await chan.delete('48 hours post-tournament conclusion auto-cleanup').catch(() => null);
              console.log(`[AutoCleanup] Deleted channel: ${chan.name} (${chan.id})`);
            }
          } catch (cErr) {
            console.warn(`[AutoCleanup] Error deleting channel ${chId}:`, cErr.message);
          }
        }

        // B. Delete associated tournament roles if not already deleted
        try {
          const guild = client.guilds.cache.get(t.guild_id) || client.guilds.cache.first();
          if (guild) {
            await guild.roles.fetch().catch(() => null);

            if (t.tournament_role_id) {
              const role = guild.roles.cache.get(t.tournament_role_id);
              if (role) {
                await role.delete('48 hours post-tournament conclusion auto-cleanup').catch(() => null);
                console.log(`[AutoCleanup] Deleted tournament role: ${role.name} (${role.id})`);
              }
            }

            if (t.pending_role_id) {
              const pRole = guild.roles.cache.get(t.pending_role_id);
              if (pRole) {
                await pRole.delete('48 hours post-tournament conclusion auto-cleanup').catch(() => null);
                console.log(`[AutoCleanup] Deleted pending role: ${pRole.name} (${pRole.id})`);
              }
            }
          }
        } catch (rErr) {
          console.warn(`[AutoCleanup] Error deleting roles for tournament #${t.id}:`, rErr.message);
        }

        dbQueries.updateTournament(t.id, { scoreboard_cleaned_48h: true, channels_and_roles_cleaned_48h: true });
        console.log(`[AutoCleanup] ✅ 48h full auto-cleanup complete for Tournament #${t.id} (All roles and channels deleted).`);
      }
    }
  }
};

module.exports = tournamentHandler;
