const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const config = require('../../config.json');

const DOMESTIC_UPI_ID = config.payment?.upiId || 'sinoprince366-1@okhdfcbank';
const INTERNATIONAL_UPI_ID = config.payment?.internationalUpiId || 'sinoprince366-1@oksbi';
const QR_CODE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi%3A%2F%2Fpay%3Fpa%3D${encodeURIComponent(DOMESTIC_UPI_ID)}%26pn%3DPrime%2520Lobby%2520Esports%26cu%3DINR`;

const embedBuilder = {
  // Rules & Verification Embed
  createRulesEmbed: (guildName) => {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`📜 Welcome to ${guildName} — Official Community & Tournament Rules`)
      .setDescription(
        `Welcome to **${guildName}**! To maintain a competitive, fair, and respectful esports environment, all members and participants must strictly adhere to the following rules.\n\n` +
        `### ⚔️ 1. Competitive Integrity & Fair Play\n` +
        `• **No Cheats or Exploits:** Aimbots, wallhacks, speedhacks, config modifications, or exploiting in-game glitches result in an **instant permanent ban & tournament blacklist**.\n` +
        `• **No Ringers / Account Sharing:** Playing under another player's credentials or unauthorized substitutions without staff consent is prohibited.\n` +
        `• **No Stream Sniping or Match Fixing:** Any form of match tampering or collusion will disqualify the player/squad immediately.\n\n` +
        `### 💳 2. Tournament Payments & Registrations\n` +
        `• 🇮🇳 **Domestic UPI ID:** \`${DOMESTIC_UPI_ID}\`\n` +
        `• 🌐 **International Receive UPI:** \`${INTERNATIONAL_UPI_ID}\`\n` +
        `• **Payment Reference:** Submit your genuine In-Game ID (IGN) and transaction reference number when registering.\n` +
        `• **Refund Policy:** Entry fees are strictly non-refundable once brackets and matchups are published.\n\n` +
        `### 📸 3. Match Proofs & Dispute Resolution\n` +
        `• **Score Submission:** Winning teams/players must upload clear end-screen screenshots to the match proof channel within 15 minutes of match conclusion.\n` +
        `• **Referee Authority:** Tournament Admin and Referee decisions are final in all match disputes.\n\n` +
        `### 🛡️ 4. Respect & Community Conduct\n` +
        `• **Zero Toxicity:** Harassment, hate speech, racism, personal abuse, and toxic DMs are strictly prohibited.\n` +
        `• **No Spam or Self-Promotion:** Unsolicited server invites, promotional links, and spam in chat/DMs will lead to a mute/ban.\n` +
        `• **Voice Channel Etiquette:** No mic-spamming or disruptive noises in public voice lounges.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### ✅ How to Unlock Full Server Access:\n` +
        `Click the **${config.emojis.verify} Verify / Accept Rules** button below to remove your \`Visitor\` role and receive the \`Member\` role with full channel access!`
      )
      .setFooter({ text: `${guildName} • Professional Esports Administration` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_verify_member')
        .setLabel('Verify / Accept Rules')
        .setStyle(ButtonStyle.Success)
        .setEmoji(config.emojis.verify)
    );

    return { embeds: [embed], components: [row] };
  },

  // Active Tournament Dashboard Embed with Scan-to-Pay QR Code
  createTournamentDashboardEmbed: (tournament, confirmedParticipants = [], pendingCount = 0) => {
    const slotsFilled = confirmedParticipants.length;
    const isFull = slotsFilled >= tournament.max_participants;
    const isClosed = tournament.status !== 'OPEN';

    let statusText = '🟢 **Registration OPEN**';
    let statusColor = config.colors.tournament;

    if (isClosed) {
      statusText = `🔴 **${tournament.status}**`;
      statusColor = config.colors.danger;
    } else if (isFull) {
      statusText = '🟡 **Tournament FULL (Capacity Reached)**';
      statusColor = config.colors.warning;
    }

    let parsedAmount = null;
    if (tournament.entry_fee) {
      const match = tournament.entry_fee.match(/(\d+)/);
      if (match) parsedAmount = match[1];
    }
    const dashboardQrUrl = parsedAmount 
      ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(`upi://pay?pa=${DOMESTIC_UPI_ID}&pn=Prime%20Lobby%20Esports&am=${parsedAmount}&tn=${encodeURIComponent(tournament.title.substring(0, 30))}&cu=INR`)}`
      : QR_CODE_URL;

    const participantListString = confirmedParticipants.length > 0
      ? confirmedParticipants.map((p, idx) => `\`${idx + 1}.\` <@${p.user_id}> ${p.ingame_id ? `*(IGN: ${p.ingame_id})*` : ''}`).join('\n')
      : '_No confirmed participants yet. Be the first to register!_';

    const mode = tournament.mode || (tournament.title?.toLowerCase().includes('duo') ? 'duo' : (tournament.title?.toLowerCase().includes('squad') ? 'squad' : 'solo'));
    const teamUnit = mode === 'duo' ? 'Duo Teams' : (mode === 'squad' || mode === '5v5' || tournament.game?.toLowerCase().includes('valorant') ? 'Teams' : 'Players');
    const remainingSlots = Math.max(0, tournament.max_participants - slotsFilled);

    const embed = new EmbedBuilder()
      .setColor(statusColor)
      .setTitle(`🏆 [ID: #${tournament.id}] ${tournament.title}`)
      .setDescription(
        `🎮 **Game / Platform:** \`${tournament.game}\`\n` +
        `📊 **Status:** ${statusText}\n` +
        `👥 **Confirmed & Booked Slots:** \`${slotsFilled} / ${tournament.max_participants} ${teamUnit}\`\n` +
        `🎟️ **Available Balance to Join:** \`${remainingSlots} ${teamUnit} can still join\`\n` +
        (pendingCount > 0 ? `⏳ **Payments Under Review:** \`${pendingCount} ${teamUnit} awaiting admin verification\`\n` : '') +
        `\n💰 **Prize Pool:**\n\`\`\`\n${tournament.prize_pool}\n\`\`\`\n` +
        `💳 **Official UPI Payment Gateways:**\n` +
        `• **Entry Fee:** \`${tournament.entry_fee}\`\n` +
        `• 🇮🇳 **Domestic UPI:** \`${DOMESTIC_UPI_ID}\`\n` +
        `• 🌐 **International UPI:** \`${INTERNATIONAL_UPI_ID}\`\n` +
        `• 📲 **How Slot Booking Works:** Click **"Register & Pay"** below. Your slot is officially booked once Admin verifies & accepts payment. If payment is rejected, your slot is automatically released back to the balance.\n\n` +
        (tournament.rules_text ? `📋 **Special Tournament Rules:**\n${tournament.rules_text}\n\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Confirmed Competitors (${slotsFilled}/${tournament.max_participants}):**\n` +
        (confirmedParticipants.length > 15 
          ? confirmedParticipants.slice(0, 15).map((p, idx) => `\`${idx + 1}.\` <@${p.user_id}>`).join('\n') + `\n_...and ${confirmedParticipants.length - 15} more_`
          : participantListString)
      )
      .setFooter({ text: `Hosted by Admin (ID: ${tournament.created_by}) • QR code delivered directly to your DM` })
      .setTimestamp();

    const buttonLabel = isFull
      ? `Tournament Full (${tournament.max_participants}/${tournament.max_participants})`
      : (parsedAmount ? `🎮 Register & Get ₹${parsedAmount} QR (DM)` : '🎮 Register (QR to DM)');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_tourney_join_${tournament.id}`)
        .setLabel(buttonLabel)
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎮')
        .setDisabled(isFull || isClosed),
      new ButtonBuilder()
        .setCustomId(`btn_tourney_leave_${tournament.id}`)
        .setLabel('Leave / Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
        .setDisabled(isClosed),
      new ButtonBuilder()
        .setCustomId(`btn_tourney_view_scoreboard_${tournament.id}`)
        .setLabel('View Scoreboard')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📊')
    );

    return { embeds: [embed], components: isClosed ? [] : [row] };
  },

  // Payment Approval Alert for Admins
  createPaymentApprovalEmbed: (tournament, member, ign, transactionId) => {
    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle(`💳 Payment Verification Request — #${tournament.id} ${tournament.title}`)
      .setDescription(
        `A player has registered and submitted GPay payment details.\n\n` +
        `👤 **Player:** <@${member.id}> (\`${member.user.tag}\`)\n` +
        `🎮 **In-Game ID:** \`${ign}\`\n` +
        `🧾 **UPI / Transaction Reference:**\n\`\`\`\n${transactionId || 'None provided'}\n\`\`\`\n` +
        `💰 **Entry Fee:** \`${tournament.entry_fee}\`\n` +
        `🏦 **Authorized UPI Accounts:**\n` +
        `• 🇮🇳 Domestic: \`${DOMESTIC_UPI_ID}\`\n` +
        `• 🌐 International: \`${INTERNATIONAL_UPI_ID}\`\n\n` +
        `*Click **Approve** to remove their \`Pending\` role, grant the Tournament Role, and unlock match channels!*`
      )
      .setThumbnail(QR_CODE_URL)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_approve_pay_${tournament.id}_${member.id}`)
        .setLabel('Approve Payment & Grant Access')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`btn_reject_pay_${tournament.id}_${member.id}`)
        .setLabel('Reject / Deny')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    return { embeds: [embed], components: [row] };
  },

  // Complete Live Tournament Scoreboard & Bracket / Standings Embed
  createTournamentScoreboardEmbed: (tournament, confirmedParticipants = [], scoreboardEntries = []) => {
    const maxSlots = tournament.max_participants || 8;
    const gameName = (tournament.game || '').toLowerCase();
    const isBattleRoyale = gameName.includes('pubg') || gameName.includes('free fire');
    const isValorant = gameName.includes('valorant');

    // Build Roster lines
    let rosterLines = [];
    const displayCount = Math.min(confirmedParticipants.length, 25);
    for (let i = 0; i < displayCount; i++) {
      const p = confirmedParticipants[i];
      const squadInfo = p.squad_name ? ` [Squad: **${p.squad_name}**]` : '';
      rosterLines.push(`\`Slot ${i + 1}:\` <@${p.user_id}> | IGN: **${p.in_game_id || p.username}**${squadInfo}`);
    }
    if (confirmedParticipants.length > 25) {
      rosterLines.push(`_...and ${confirmedParticipants.length - 25} more confirmed competitors_`);
    }
    if (confirmedParticipants.length === 0) {
      rosterLines.push(`⚪ *[Open Slots — Awaiting competitor registrations]*`);
    }

    let standingsOrBracketText = '';

    if (gameName.includes('pubg')) {
      // PUBG Mobile 3-Map Battle Royale Standings
      standingsOrBracketText = `### 🗺️ 3 Maps Format: Erangel ➔ Miramar ➔ Sanhok\n` +
        `*All teams play all 3 maps. Champion is crowned by Cumulative Points across all 3 maps!*\n\n` +
        `### 🎯 3-Map Standings & Points Table:\n`;
      if (scoreboardEntries.length > 0) {
        scoreboardEntries.forEach(m => {
          const vsText = m.player2 ? ` vs **${m.player2}**` : '';
          const winText = m.winner ? ` (🏆 **${m.winner}**)` : '';
          standingsOrBracketText += `• **${m.round_name}:** **${m.player1}**${vsText} ➔ \`${m.score}\`${winText}\n`;
        });
      } else {
        standingsOrBracketText += `• **Match 1 (Erangel):** *Awaiting Custom Room & Match Start*\n` +
          `• **Match 2 (Miramar):** *Scheduled*\n` +
          `• **Match 3 (Sanhok):** *Scheduled*\n\n` +
          `📊 **Esports Points System (Cumulative Across 3 Maps):**\n` +
          `\`#1: 10 pts | #2: 6 pts | #3: 5 pts | #4: 4 pts | #5: 3 pts | #6: 2 pts | #7-8: 1 pt | Kill: 1 pt\``;
      }
    } else if (gameName.includes('free fire')) {
      // Free Fire 3-Map / Play 3 Times Standings
      standingsOrBracketText = `### 🗺️ 3 Maps Format: Bermuda ➔ Purgatory ➔ Kalahari (Play 3 Times)\n` +
        `*All teams play 3 matches. Champion is crowned by Cumulative Points across all 3 matches!*\n\n` +
        `### 🎯 3-Match Standings & Points Table:\n`;
      if (scoreboardEntries.length > 0) {
        scoreboardEntries.forEach(m => {
          const vsText = m.player2 ? ` vs **${m.player2}**` : '';
          const winText = m.winner ? ` (🏆 **${m.winner}**)` : '';
          standingsOrBracketText += `• **${m.round_name}:** **${m.player1}**${vsText} ➔ \`${m.score}\`${winText}\n`;
        });
      } else {
        standingsOrBracketText += `• **Match 1 (Bermuda):** *Awaiting Custom Room & Match Start*\n` +
          `• **Match 2 (Purgatory):** *Scheduled*\n` +
          `• **Match 3 (Kalahari):** *Scheduled*\n\n` +
          `📊 **Points System Reference (Cumulative Across 3 Matches):**\n` +
          `\`#1: 12 pts | #2: 9 pts | #3: 8 pts | #4: 7 pts | #5: 6 pts | #6: 4 pts | #7: 2 pts | Kill: 1 pt\``;
      }
    } else if (isValorant) {
      // Valorant 15 Teams (All Teams Play 2 Times Guaranteed)
      const m1 = scoreboardEntries.filter(e => e.round_name.toLowerCase().includes('round 1') || e.round_name.toLowerCase().includes('match 1'));
      const m2 = scoreboardEntries.filter(e => e.round_name.toLowerCase().includes('round 2') || e.round_name.toLowerCase().includes('match 2') || e.round_name.toLowerCase().includes('lower'));
      const finals = scoreboardEntries.filter(e => e.round_name.toLowerCase().includes('final') || e.round_name.toLowerCase().includes('semi'));

      standingsOrBracketText = `🛡️ **Format: All 15 Teams Play 2 Times Guaranteed (Double Elimination)**\n` +
        `*Every team is guaranteed at least 2 competitive fixtures!*\n\n` +
        `### ⚔️ Match 1 / Upper Round (All 15 Teams):\n`;
      if (m1.length > 0) {
        m1.forEach(m => { standingsOrBracketText += `• **${m.round_name}:** **${m.player1}** vs **${m.player2 || 'BYE'}** ➔ \`${m.score}\` (🏆 **${m.winner}**)\n`; });
      } else {
        standingsOrBracketText += `• Fixtures: *All 15 Teams play their 1st Match*\n`;
      }

      standingsOrBracketText += `\n### ⚔️ Match 2 / Lower Round (Second Chance — Every Team Plays 2nd Time):\n`;
      if (m2.length > 0) {
        m2.forEach(m => { standingsOrBracketText += `• **${m.round_name}:** **${m.player1}** vs **${m.player2}** ➔ \`${m.score}\` (🏆 **${m.winner}**)\n`; });
      } else {
        standingsOrBracketText += `• Fixtures: *All teams play their guaranteed 2nd Match*\n`;
      }

      standingsOrBracketText += `\n### 👑 Semi-Finals & Grand Championship:\n`;
      if (finals.length > 0) {
        finals.forEach(m => { standingsOrBracketText += `• **${m.round_name}:** **${m.player1}** vs **${m.player2}** ➔ \`${m.score}\` (🏆 **${m.winner}**)\n`; });
      } else {
        standingsOrBracketText += `• Semi-Finals & Grand Finals: *Pending Match 1 & 2 results*\n`;
      }
    } else {
      // eFootball / Standard 8-Player Single Elimination Bracket
      const qfMatches = scoreboardEntries.filter(e => e.round_name.toLowerCase().includes('quarter') || e.round_name.toLowerCase().includes('round 1'));
      const sfMatches = scoreboardEntries.filter(e => e.round_name.toLowerCase().includes('semi'));
      const finalMatches = scoreboardEntries.filter(e => e.round_name.toLowerCase().includes('final') && !e.round_name.toLowerCase().includes('semi') && !e.round_name.toLowerCase().includes('quarter'));

      standingsOrBracketText = `### ⚔️ Round 1 / Quarter-Finals (Top 8):\n`;
      if (qfMatches.length > 0) {
        qfMatches.forEach(m => {
          standingsOrBracketText += `• **${m.round_name}:** **${m.player1}** vs **${m.player2}** ➔ \`${m.score}\` (🏆 **${m.winner}**)\n`;
        });
      } else {
        standingsOrBracketText += `• Match 1: \`Slot 1\` vs \`Slot 2\` ➔ *Awaiting Match*\n` +
          `• Match 2: \`Slot 3\` vs \`Slot 4\` ➔ *Awaiting Match*\n` +
          `• Match 3: \`Slot 5\` vs \`Slot 6\` ➔ *Awaiting Match*\n` +
          `• Match 4: \`Slot 7\` vs \`Slot 8\` ➔ *Awaiting Match*\n`;
      }

      standingsOrBracketText += `\n### ⚔️ Round 2 / Semi-Finals (Final 4):\n`;
      if (sfMatches.length > 0) {
        sfMatches.forEach(m => {
          standingsOrBracketText += `• **${m.round_name}:** **${m.player1}** vs **${m.player2}** ➔ \`${m.score}\` (🏆 **${m.winner}**)\n`;
        });
      } else {
        standingsOrBracketText += `• Semi-Final 1: Winner M1 vs Winner M2 ➔ *Pending*\n` +
          `• Semi-Final 2: Winner M3 vs Winner M4 ➔ *Pending*\n`;
      }

      standingsOrBracketText += `\n### 👑 Grand Finals (Championship):\n`;
      if (finalMatches.length > 0) {
        finalMatches.forEach(m => {
          standingsOrBracketText += `• **${m.round_name}:** **${m.player1}** vs **${m.player2}** ➔ \`${m.score}\` (🏆 **${m.winner}**)\n`;
        });
      } else {
        standingsOrBracketText += `• Grand Final: Winner SF1 vs Winner SF2 ➔ *Pending*\n`;
      }
    }

    const finalMatches = scoreboardEntries.filter(e => e.round_name.toLowerCase().includes('final') && !e.round_name.toLowerCase().includes('semi') && !e.round_name.toLowerCase().includes('quarter'));
    const latestWinner = finalMatches.length > 0 ? finalMatches[finalMatches.length - 1].winner : null;

    const embed = new EmbedBuilder()
      .setColor('#00E676')
      .setTitle(`📊 LIVE TOURNAMENT SCOREBOARD & ${isBattleRoyale ? 'STANDINGS' : 'BRACKET'}`)
      .setDescription(
        `🏆 **Tournament:** **#${tournament.id} — ${tournament.title}** (\`${tournament.game}\`)\n` +
        `💰 **Entry Fee:** \`${tournament.entry_fee}\` | **Slots:** \`${confirmedParticipants.length}/${maxSlots}\`\n` +
        `🥇 **Prize Pool:** **${tournament.prize_pool}**\n` +
        `📌 **Status:** \`${tournament.status}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 👥 Confirmed Competitors (${confirmedParticipants.length}/${maxSlots}):\n` +
        rosterLines.join('\n') +
        `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        standingsOrBracketText +
        `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        (latestWinner
          ? `### 👑 TOURNAMENT CHAMPION:\n# 🏆 **${latestWinner}**\n*Wins 🥇 ${tournament.prize_pool}!*`
          : `*Admin updates match scores using \`/tournament scoreboard\`*`)
      )
      .setFooter({ text: `${tournament.title} • Live Standings & Bracket` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_tourney_scoreboard_refresh_${tournament.id}`)
        .setLabel('Refresh Scoreboard')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`btn_tourney_info_${tournament.id}`)
        .setLabel('Tournament Details')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('ℹ️')
    );

    return { embeds: [embed], components: [row] };
  },

  // Live Scoreboard & Match Result Announcement Embed
  createScoreboardEmbed: (tournament, round, player1, player2, score, winner, adminUser) => {
    const embed = new EmbedBuilder()
      .setColor('#00E676')
      .setTitle(`📊 MATCH RESULT & SCOREBOARD — ${tournament.title}`)
      .setDescription(
        `🏆 **Tournament:** **${tournament.title}** (\`${tournament.game}\`)\n` +
        `⚔️ **Stage / Round:** \`${round}\`\n\n` +
        (player2 ? `**Matchup:**\n🔹 **${player1}**  🆚  🔸 **${player2}**\n\n` : `**Team / Player:** **${player1}**\n\n`) +
        `🎯 **Score / Points:**\n` +
        `\`\`\`\n${score}\n\`\`\`\n` +
        (winner ? `👑 **RESULT / WINNER:**\n### 🏆 **${winner}**\n\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Official result updated by Admin <@${adminUser.id}>*`
      )
      .setFooter({ text: `${tournament.title} Official Scoreboard` })
      .setTimestamp();

    return { embeds: [embed] };
  },

  // Support Ticket Desk Embed
  createTicketPanelEmbed: () => {
    const embed = new EmbedBuilder()
      .setColor(config.colors.ticket)
      .setTitle('🎫 Support & Tournament Helpdesk')
      .setDescription(
        `Need help with a tournament, payment verification, dispute, or server support?\n\n` +
        `**How it works:**\n` +
        `1. Click the button below or select a category.\n` +
        `2. A private ticket channel will be created automatically for you and the support staff.\n` +
        `3. Explain your issue with screenshots or payment transaction IDs.\n` +
        `4. Our Admins and Staff will assist you promptly.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Click **Open Support Ticket** to begin.*`
      )
      .setFooter({ text: 'Fast, secure & private staff assistance' });

    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_ticket_category')
        .setPlaceholder('📂 Select ticket category to open...')
        .addOptions([
          {
            label: 'Tournament & Payment Support',
            description: 'GPay payment issues, slot registration, match disputes',
            value: 'tournament_support',
            emoji: '🏆'
          },
          {
            label: 'General Server Support',
            description: 'Questions, role issues, permissions',
            value: 'general_support',
            emoji: '💬'
          },
          {
            label: 'Report a User / Cheater',
            description: 'Report rule violations, toxic behavior, or hacks',
            value: 'report_support',
            emoji: '🚨'
          },
          {
            label: 'Voice Support Request',
            description: 'Request unmuting in Support Voice Channel',
            value: 'voice_support',
            emoji: '🎙️'
          }
        ])
    );

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_open_ticket_general')
        .setLabel('Open Support Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji(config.emojis.ticket)
    );

    return { embeds: [embed], components: [selectMenu, buttonRow] };
  },

  // Inside newly opened Ticket Channel
  createTicketWelcomeEmbed: (user, category, ticketNum) => {
    const embed = new EmbedBuilder()
      .setColor(config.colors.ticket)
      .setTitle(`🎫 Ticket #${ticketNum} — ${category}`)
      .setDescription(
        `Hello <@${user.id}>, welcome to your private support channel.\n\n` +
        `**Category:** \`${category}\`\n` +
        `Please state your question, dispute, or provide payment screenshots/GPay reference IDs below. Staff has been notified and will assist you shortly.\n\n` +
        `**Staff Controls:**\n` +
        `• 🔒 **Close Ticket:** Archives/deletes this channel (Admin only).\n` +
        `• 🙋 **Claim Ticket:** Assigns staff member to this ticket.\n` +
        `• 🎙️ **Voice Unmute:** Request or grant speak permission in the support voice room.`
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_ticket_claim')
        .setLabel('Claim Ticket')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🙋'),
      new ButtonBuilder()
        .setCustomId('btn_ticket_unmute_voice')
        .setLabel('Unmute in Voice')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎙️'),
      new ButtonBuilder()
        .setCustomId('btn_ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒')
    );

    return { embeds: [embed], components: [row] };
  },

  // Support Voice Info Embed
  createSupportVoiceEmbed: (voiceChannelName) => {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🔊 Support Waiting Room — Voice Channel`)
      .setDescription(
        `Welcome to the **${voiceChannelName}**.\n\n` +
        `**Voice Channel Policy:**\n` +
        `• When you join this voice room, **you will be muted by default** to maintain order.\n` +
        `• Only **Admins and Support Staff** can speak freely.\n` +
        `• When it is your turn, an Admin will unmute your microphone or grant you speaking permissions via your support ticket.\n\n` +
        `*Need voice assistance? Open a ticket in the support channel first!*`
      )
      .setFooter({ text: 'Admin Controlled Voice Moderation' });

    return { embeds: [embed] };
  },

  // Game Roles Selection Panel
  createGameRolesEmbed: (guild = null) => {
    const embed = new EmbedBuilder()
      .setColor('#00b4d8')
      .setTitle('🎮 Pick Your Games — Unlock Game Categories & Channels')
      .setDescription(
        `Welcome to the **Prime Lobby Esports Game Selector**!\n` +
        `Click the buttons below or use the dropdown to select the games you play.\n\n` +
        `**Selecting a game unlocks its private chat, voice room, and tournament announcements:**\n\n` +
        config.gameRoles.map(g => {
          const chan = guild?.channels?.cache?.find(c => c.name === g.textChannel);
          const chanDisplay = chan ? `<#${chan.id}>` : `\`#${g.textChannel}\``;
          return `• ${g.emoji} **${g.name}** ➔ Access to ${chanDisplay} & \`${g.voiceChannel}\``;
        }).join('\n') +
        `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 **1-Click Buttons:** Tap any game button below to instantly toggle the role!\n` +
        `🔽 **Dropdown Menu:** Or use the multi-select menu below to pick multiple games at once.`
      )
      .setFooter({ text: 'Prime Lobby Esports • Instant Game Role Selector' })
      .setTimestamp();

    const buttonRow = new ActionRowBuilder().addComponents(
      config.gameRoles.map(g =>
        new ButtonBuilder()
          .setCustomId(`btn_game_role_${g.key}`)
          .setLabel(g.name)
          .setEmoji(g.emoji)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_game_roles')
        .setPlaceholder('🎮 Or choose games from dropdown (Select / Deselect)...')
        .setMinValues(0)
        .setMaxValues(config.gameRoles.length)
        .addOptions(
          config.gameRoles.map(g => ({
            label: g.name,
            value: g.key,
            description: g.description,
            emoji: g.emoji
          }))
        )
    );

    return { embeds: [embed], components: [buttonRow, selectMenu] };
  }
};

module.exports = embedBuilder;
