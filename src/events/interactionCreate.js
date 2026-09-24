const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');
const roleHandler = require('../handlers/roleHandler');
const tournamentHandler = require('../handlers/tournamentHandler');
const ticketHandler = require('../handlers/ticketHandler');
const voiceHandler = require('../handlers/voiceHandler');
const gameRoleHandler = require('../handlers/gameRoleHandler');
const paymentHandler = require('../handlers/paymentHandler');
const paymentEmbeds = require('../utils/paymentEmbeds');
const paymentBotService = require('../utils/paymentBotService');
const embedBuilder = require('../utils/embedBuilder');
const { dbQueries } = require('../database/db');
const config = require('../../config.json');

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, clientInstance = null) {
    const client = clientInstance || interaction.client;

    const isPaymentBot = Boolean(
      process.env.PAYMENT_CLIENT_ID && client.user && (
        client.user.id === process.env.PAYMENT_CLIENT_ID ||
        client.user.id === '1551987536925032569'
      )
    );

    const isPaymentInteraction = 
      (interaction.isChatInputCommand() && ['pay', 'pay-admin'].includes(interaction.commandName)) ||
      (interaction.isButton() && (
        interaction.customId.startsWith('btn_pay_') ||
        interaction.customId.startsWith('btn_dm_open_ticket_') ||
        interaction.customId.startsWith('btn_approve_pay_') ||
        interaction.customId.startsWith('btn_reject_pay_') ||
        interaction.customId.startsWith('btn_request_proof_') ||
        interaction.customId.startsWith('btn_ticket_from_proof_')
      )) ||
      (interaction.isModalSubmit() && (
        interaction.customId === 'modal_submit_payment_proof' ||
        interaction.customId === 'modal_generate_custom_qr'
      ));

    // Strict Bot Duty Separation:
    if (process.env.PAYMENT_BOT_TOKEN) {
      if (isPaymentBot && !isPaymentInteraction) {
        // Payment Bot only does payment things
        return;
      }
      if (!isPaymentBot && isPaymentInteraction) {
        // Main Bot only does other things (non-payment)
        return;
      }
    }

    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[CommandError] Error executing /${interaction.commandName}:`, error);
        const replyPayload = {
          content: '❌ An error occurred while executing this command!',
          ephemeral: true
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload).catch(() => null);
        } else {
          await interaction.reply(replyPayload).catch(() => null);
        }
      }
      return;
    }

    // 2. Handle Button Interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Rule Acceptance / Verification Button
      if (customId === 'btn_verify_member') {
        await interaction.deferUpdate().catch(() => null);
        await roleHandler.verifyAndPromoteToMember(interaction.member);
        return;
      }

      // Tournament Register Button -> Show Modal
      if (customId.startsWith('btn_tourney_join_')) {
        const tournamentId = parseInt(customId.replace('btn_tourney_join_', ''), 10);
        const tournament = dbQueries.getTournament(tournamentId);

        if (!tournament) {
          return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
        }

        if (dbQueries.isParticipant(tournamentId, interaction.user.id)) {
          const participants = dbQueries.getParticipants(tournamentId);
          const p = participants.find(part => part.user_id === interaction.user.id);
          const regData = p ? { ingame_id: p.game_id, squad_name: p.squad_name } : {};
          const dmPayload = paymentEmbeds.createTournamentAssistedDmPayload(tournament, interaction.user, regData);
          await paymentBotService.sendDm(interaction.user.id, dmPayload, client);

          return interaction.reply({
            content: 'ℹ️ You have already submitted registration for this tournament!\n📬 **We have re-sent your payment invoice directly from PLE Payments Bot to your DMs.** Please check your private messages to pay and submit proof.',
            ephemeral: true
          });
        }

        const mode = tournament.mode || (tournament.title.toLowerCase().includes('duo') ? 'duo' : (tournament.title.toLowerCase().includes('squad') ? 'squad' : 'solo'));
        const isDuo = mode === 'duo' || tournament.title.toLowerCase().includes('duo');
        const isSquad = mode === 'squad' || tournament.title.toLowerCase().includes('squad') || mode === '5v5' || tournament.title.toLowerCase().includes('team');

        const modal = new ModalBuilder()
          .setCustomId(`modal_tourney_reg_${tournamentId}`)
          .setTitle(isDuo ? `Duo Registration: #${tournamentId}` : (isSquad ? `Squad Registration: #${tournamentId}` : `Register: #${tournamentId}`));

        if (isDuo) {
          const ignInput = new TextInputBuilder()
            .setCustomId('input_ign')
            .setLabel('Player 1 (Your) In-Game ID / IGN')
            .setPlaceholder('e.g., PlayerOne#1234 or UID: 5123456789')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          const teammateInput = new TextInputBuilder()
            .setCustomId('input_teammate')
            .setLabel('Player 2 (Duo Partner) IGN / UID')
            .setPlaceholder('e.g., PartnerTwo#5678 or UID: 9876543210')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          const squadInput = new TextInputBuilder()
            .setCustomId('input_squad_name')
            .setLabel('Duo Team Name')
            .setPlaceholder('e.g., Lethal Duo, Shadow Pair')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          modal.addComponents(
            new ActionRowBuilder().addComponents(ignInput),
            new ActionRowBuilder().addComponents(teammateInput),
            new ActionRowBuilder().addComponents(squadInput)
          );
        } else if (isSquad) {
          const ignInput = new TextInputBuilder()
            .setCustomId('input_ign')
            .setLabel('Squad Leader (Your) In-Game ID / IGN')
            .setPlaceholder('e.g., Leader#1234 or UID: 5123456789')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          const squadInput = new TextInputBuilder()
            .setCustomId('input_squad_name')
            .setLabel('Squad / Team Name')
            .setPlaceholder('e.g., Team Titans, Alpha Warriors')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          const teammateInput = new TextInputBuilder()
            .setCustomId('input_teammate')
            .setLabel('Teammates (Players 2, 3, 4) IGNs')
            .setPlaceholder('e.g., P2: Slayer, P3: Sniper, P4: Rusher')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(200);

          modal.addComponents(
            new ActionRowBuilder().addComponents(ignInput),
            new ActionRowBuilder().addComponents(squadInput),
            new ActionRowBuilder().addComponents(teammateInput)
          );
        } else {
          const ignInput = new TextInputBuilder()
            .setCustomId('input_ign')
            .setLabel(`Your ${tournament.game} In-Game ID / IGN`)
            .setPlaceholder('e.g., PlayerOne#1234 or UID: 5123456789')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          const squadInput = new TextInputBuilder()
            .setCustomId('input_squad_name')
            .setLabel('Player Display Name / Club Name (or "Solo")')
            .setPlaceholder('e.g., FC Barcelona, PlayerOne, or Solo')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          modal.addComponents(
            new ActionRowBuilder().addComponents(ignInput),
            new ActionRowBuilder().addComponents(squadInput)
          );
        }

        return interaction.showModal(modal);
      }

      // Tournament Leave Button
      if (customId.startsWith('btn_tourney_leave_')) {
        const tournamentId = parseInt(customId.replace('btn_tourney_leave_', ''), 10);
        await interaction.deferReply({ ephemeral: true });
        const res = await tournamentHandler.unregisterUser(client, tournamentId, interaction.member);
        return interaction.editReply({ content: res.message });
      }


      // Tournament Admin Close Button -> Show Modal
      if (customId.startsWith('btn_tourney_close_')) {
        const tournamentId = parseInt(customId.replace('btn_tourney_close_', ''), 10);

        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.roles.cache.some(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase().includes('host'));

        if (!isAdmin) {
          return interaction.reply({
            content: '🚫 Only Admins and Tournament Hosts can close tournaments.',
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_tourney_close_${tournamentId}`)
          .setTitle(`Conclude Tournament #${tournamentId}`);

        const winnerInput = new TextInputBuilder()
          .setCustomId('input_winner')
          .setLabel('Winner & Podium Results')
          .setPlaceholder('🥇 1st: PlayerA | 🥈 2nd: PlayerB | 🥉 3rd: PlayerC')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const deleteChannelsInput = new TextInputBuilder()
          .setCustomId('input_delete_channels')
          .setLabel('Delete Event Channels? (yes / no)')
          .setValue('no')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(winnerInput),
          new ActionRowBuilder().addComponents(deleteChannelsInput)
        );

        return interaction.showModal(modal);
      }

      // Open Ticket Button
      if (customId === 'btn_open_ticket_general') {
        await interaction.deferReply({ ephemeral: true });
        const res = await ticketHandler.createTicketChannel(interaction.guild, interaction.member, 'General Support');
        if (!res.success) {
          return interaction.editReply({ content: res.message });
        }
        return interaction.editReply({ content: `✅ Ticket created! Head over to <#${res.channel.id}>.` });
      }

      // Claim Ticket Button
      if (customId === 'btn_ticket_claim') {
        const isAdminOrStaff = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
          interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.roles.cache.some(r =>
            r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
            r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
            r.name.toLowerCase() === 'support' ||
            r.name.toLowerCase().includes('support') ||
            r.name.toLowerCase().includes('staff') ||
            r.name.toLowerCase().includes('admin')
          );

        if (!isAdminOrStaff) {
          return interaction.reply({ content: '🚫 Only Support Staff and Admins can claim tickets.', ephemeral: true });
        }

        await ticketHandler.claimTicket(interaction.channel, interaction.member);
        return interaction.reply({ content: `✅ Ticket claimed by <@${interaction.user.id}>.`, ephemeral: true });
      }

      // Close Ticket Button (Admin/Staff only)
      if (customId === 'btn_ticket_close') {
        const isAdminOrStaff = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
          interaction.member.roles.cache.some(r =>
            r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
            r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
            r.name.toLowerCase() === 'support' ||
            r.name.toLowerCase().includes('support') ||
            r.name.toLowerCase().includes('staff') ||
            r.name.toLowerCase().includes('admin')
          );

        if (!isAdminOrStaff) {
          return interaction.reply({
            content: '🚫 Only Admins and Support Staff are authorized to close support tickets.',
            ephemeral: true
          });
        }

        await interaction.reply({ content: '🔒 Closing ticket...' });
        await ticketHandler.closeTicket(interaction.channel, interaction.member);
        return;
      }

      // Ticket Voice Unmute Button
      if (customId === 'btn_ticket_unmute_voice') {
        const ticketRecord = dbQueries.getTicketByChannel(interaction.channel.id);
        if (!ticketRecord) {
          return interaction.reply({ content: '❌ Ticket record not found.', ephemeral: true });
        }

        const isAdminOrStaff = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.roles.cache.some(r =>
            r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
            r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
            r.name.toLowerCase() === 'support' ||
            r.name.toLowerCase().includes('support') ||
            r.name.toLowerCase().includes('staff') ||
            r.name.toLowerCase().includes('admin')
          );

        if (!isAdminOrStaff) {
          return interaction.reply({ content: '🚫 Only Admins and Support Staff can unmute users.', ephemeral: true });
        }

        const ticketAuthor = await interaction.guild.members.fetch(ticketRecord.user_id).catch(() => null);
        if (!ticketAuthor) {
          return interaction.reply({ content: '❌ Member is no longer in this server.', ephemeral: true });
        }

        const res = await voiceHandler.unmuteUserInVoice(interaction.guild, ticketAuthor, interaction.member);
        return interaction.reply({ content: res.message });
      }

      // Tournament Payment Approval Button (Admin / Host only)
      if (customId.startsWith('btn_approve_pay_')) {
        const parts = customId.replace('btn_approve_pay_', '').split('_');
        const tournamentId = parseInt(parts[0], 10);
        const targetUserId = parts[1];

        const isAdminOrHost = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.roles.cache.some(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase().includes('host'));

        if (!isAdminOrHost) {
          return interaction.reply({ content: '🚫 Only Admins and Tournament Hosts can approve payments.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });
        const res = await tournamentHandler.approvePayment(client, tournamentId, targetUserId, interaction.member);

        if (interaction.message) {
          await interaction.message.edit({ components: [] }).catch(() => null);
        }

        return interaction.editReply({ content: res.message });
      }

      // Tournament Payment Rejection Button (Admin / Host only)
      if (customId.startsWith('btn_reject_pay_')) {
        const parts = customId.replace('btn_reject_pay_', '').split('_');
        const tournamentId = parseInt(parts[0], 10);
        const targetUserId = parts[1];

        const isAdminOrHost = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.roles.cache.some(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase().includes('host'));

        if (!isAdminOrHost) {
          return interaction.reply({ content: '🚫 Only Admins and Tournament Hosts can reject payments.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });
        const res = await tournamentHandler.rejectPayment(client, tournamentId, targetUserId, interaction.member);

        if (interaction.message) {
          await interaction.message.edit({ components: [] }).catch(() => null);
        }

        return interaction.editReply({ content: res.message });
      }

      // --- Dedicated Payment Desk Buttons ---
      if (customId === 'btn_pay_dm_domestic_qr') {
        const dmPayload = paymentEmbeds.createDmPaymentQrPayload(null, 'Prime Lobby Domestic Payment', interaction.user, false);
        const sendRes = await paymentBotService.sendDm(interaction.user.id, dmPayload, client);
        if (sendRes.success) {
          return interaction.reply({
            content: '📬 I have sent your **Domestic UPI QR Code** directly from **PLE Payments Bot** to your **Direct Messages (DM)**! Please check your private messages to pay and submit proof.',
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: '⚠️ Could not send you a Direct Message! Please enable **"Direct Messages from server members"** in your Discord Privacy Settings.',
            ephemeral: true
          });
        }
      }

      if (customId === 'btn_pay_dm_international_qr') {
        const dmPayload = paymentEmbeds.createDmPaymentQrPayload(null, 'Prime Lobby International Payment', interaction.user, true);
        const sendRes = await paymentBotService.sendDm(interaction.user.id, dmPayload, client);
        if (sendRes.success) {
          return interaction.reply({
            content: '📬 I have sent your **International UPI (SBI) QR Code** directly from **PLE Payments Bot** to your **Direct Messages (DM)**! Please check your private messages to pay and submit proof.',
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: '⚠️ Could not send you a Direct Message! Please enable **"Direct Messages from server members"** in your Discord Privacy Settings.',
            ephemeral: true
          });
        }
      }

      if (customId === 'btn_pay_dm_efootball_qr') {
        const targetGuild = interaction.guild || client.guilds.cache.first();
        const activeTourneys = targetGuild ? dbQueries.getActiveTournaments(targetGuild.id).filter(t => t.status === 'OPEN' && (t.game || '').toLowerCase().includes('efootball')) : [];

        if (activeTourneys.length === 0) {
          return interaction.reply({
            content: '❌ **No Active Tournament Available**\nThere are currently no active open eFootball tournaments hosted by staff.\nTournament entry fee payments are disabled and money cannot be accepted until an Admin officially hosts a tournament with `/tournament host-efootball`.\n**No money will be taken** when no tournament is running.',
            ephemeral: true
          });
        }

        const activeTourney = activeTourneys[0];
        const confirmedCount = dbQueries.getParticipantCount(activeTourney.id);
        if (confirmedCount >= activeTourney.max_participants) {
          return interaction.reply({
            content: `❌ **Tournament Full**\nTournament **#${activeTourney.id} (${activeTourney.title})** has already reached full capacity (${confirmedCount}/${activeTourney.max_participants} players).\nNo more entry payments are being accepted for this cup.`,
            ephemeral: true
          });
        }

        const fee = parseInt(activeTourney.entry_fee, 10) || 250;
        const dmPayload = paymentEmbeds.createDmPaymentQrPayload(
          fee,
          `Tournament #${activeTourney.id} (${activeTourney.title}) Entry Fee`,
          interaction.user,
          false,
          activeTourney.id
        );

        const sendRes = await paymentBotService.sendDm(interaction.user.id, dmPayload, client);
        if (sendRes.success) {
          return interaction.reply({
            content: `📬 Sent your **₹${fee} Scan-to-Pay QR Code** for **Tournament #${activeTourney.id} (${activeTourney.title})** directly from **PLE Payments Bot** to your **Direct Messages (DM)**! Please check your private messages to pay and submit proof.`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: '⚠️ Could not send you a Direct Message! Please enable **"Direct Messages from server members"** in your Discord Privacy Settings.',
            ephemeral: true
          });
        }
      }

      // View Scoreboard Button (from Dashboard or channels)
      if (customId.startsWith('btn_tourney_view_scoreboard_') || customId.startsWith('btn_tourney_scoreboard_refresh_')) {
        const tourneyId = parseInt(customId.replace('btn_tourney_view_scoreboard_', '').replace('btn_tourney_scoreboard_refresh_', ''), 10);
        const tourney = dbQueries.getTournament(tourneyId);
        if (!tourney) {
          return interaction.reply({ content: '❌ Tournament record not found.', ephemeral: true });
        }

        const confirmed = dbQueries.getConfirmedParticipants(tourneyId);
        const scoreboardEntries = dbQueries.getScoreboard(tourneyId);
        const payload = embedBuilder.createTournamentScoreboardEmbed(tourney, confirmed, scoreboardEntries);

        if (customId.startsWith('btn_tourney_scoreboard_refresh_')) {
          if (interaction.message) {
            await interaction.message.edit(payload).catch(() => null);
            return interaction.reply({ content: '✅ Scoreboard refreshed with latest standings!', ephemeral: true });
          }
        }

        return interaction.reply({ ...payload, ephemeral: true });
      }

      // Handle Support Ticket Creation from DM (e.g. after payment rejection)
      if (customId.startsWith('btn_dm_open_ticket_')) {
        const parts = customId.split('_');
        const paymentId = parts[5];
        const guildId = parts[6];

        const targetGuild = (guildId ? client.guilds.cache.get(guildId) : null) || interaction.guild || client.guilds.cache.first();
        if (!targetGuild) {
          return interaction.reply({ content: '❌ Server not found.', ephemeral: true });
        }

        const targetMember = await targetGuild.members.fetch(interaction.user.id).catch(() => null);
        if (!targetMember) {
          return interaction.reply({ content: '❌ You are not a member of this server.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const res = await ticketHandler.createTicketChannel(targetGuild, targetMember, `Payment Dispute #${paymentId || ''}`);

        if (!res.success) {
          return interaction.editReply({ content: res.message });
        }

        // Post notice in the newly created ticket
        if (res.channel) {
          await res.channel.send({
            content: `🚨 **Payment Dispute Ticket Opened** by <@${interaction.user.id}> regarding Payment Submission **#${paymentId || 'N/A'}**.\nStaff will review your payment details shortly!`
          }).catch(() => null);
        }

        return interaction.editReply({
          content: `✅ **Support Ticket Created!**\nHead over to <#${res.channel.id}> in **${targetGuild.name}** to speak directly with the admin staff.`
        });
      }

      // Handle Domestic Gateway Button in DM
      if (customId.startsWith('btn_pay_dm_reg_dom_')) {
        const parts = customId.split('_');
        const tourneyId = parts[5];
        const fee = parts[6] || '250';
        const payload = paymentEmbeds.createDmPaymentQrPayload(
          fee,
          `Tournament #${tourneyId} Entry`,
          interaction.user,
          false,
          tourneyId
        );
        return interaction.reply({
          content: '🇮🇳 **Domestic Gateway Selected (UPI / GPay / PhonePe / Paytm)**\nPlease scan the QR code below or use the official UPI ID.',
          ...payload
        });
      }

      // Handle International Gateway Button in DM
      if (customId.startsWith('btn_pay_dm_reg_intl_')) {
        const parts = customId.split('_');
        const tourneyId = parts[5];
        const fee = parts[6] || '250';
        const payload = paymentEmbeds.createDmPaymentQrPayload(
          fee,
          `Tournament #${tourneyId} Entry`,
          interaction.user,
          true,
          tourneyId
        );
        return interaction.reply({
          content: '🌐 **International Gateway Selected (Cross-Border / NRI / Card / PayPal)**\nPlease scan the QR code below or transfer to the international UPI ID.',
          ...payload
        });
      }

      if (customId === 'btn_pay_open_submit_modal' || customId.startsWith('btn_pay_submit_for_')) {
        let presetAmount = '';
        let presetTourneyId = null;
        if (customId.startsWith('btn_pay_submit_for_')) {
          const match = customId.match(/btn_pay_submit_for_(\d+)(?:_t_(\d+))?/);
          if (match) {
            presetAmount = match[1];
            presetTourneyId = match[2] || null;
          }
        }

        const modal = new ModalBuilder()
          .setCustomId('modal_submit_payment_proof')
          .setTitle('Submit Payment Proof');

        const utrInput = new TextInputBuilder()
          .setCustomId('input_pay_utr')
          .setLabel('12-Digit Reference / UTR Number')
          .setPlaceholder('e.g. 423984729384')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(6)
          .setMaxLength(35);

        const amountInput = new TextInputBuilder()
          .setCustomId('input_pay_amount')
          .setLabel('Amount Paid in INR (₹)')
          .setPlaceholder('e.g. 250')
          .setValue(presetAmount)
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const purposeInput = new TextInputBuilder()
          .setCustomId('input_pay_purpose')
          .setLabel('Payment Purpose')
          .setPlaceholder('e.g. Tournament Entry Fee')
          .setValue(presetTourneyId ? `Tournament #${presetTourneyId} Entry Fee` : '')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const proofUrlInput = new TextInputBuilder()
          .setCustomId('input_pay_proof_url')
          .setLabel('Payment Screenshot (Optional / Upload in DM)')
          .setPlaceholder('Leave blank & upload your JPG/PNG screenshot directly in chat!')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(utrInput),
          new ActionRowBuilder().addComponents(amountInput),
          new ActionRowBuilder().addComponents(purposeInput),
          new ActionRowBuilder().addComponents(proofUrlInput)
        );

        try {
          return await interaction.showModal(modal);
        } catch (e) {
          return interaction.reply({
            content: `📸 **Submit Payment Proof:**\n• **Direct Upload (Recommended):** Simply drag & drop your payment screenshot (JPG/PNG) into this DM!\n• **Or Slash Command:** Run \`/pay submit amount:${presetAmount || '250'}\` to attach your screenshot directly.`
          });
        }
      }

      if (customId === 'btn_pay_generate_custom_qr') {
        const modal = new ModalBuilder()
          .setCustomId('modal_generate_custom_qr')
          .setTitle('Generate Custom Scan-to-Pay QR');

        const amountInput = new TextInputBuilder()
          .setCustomId('input_qr_amount')
          .setLabel('Amount to Pay in INR (₹)')
          .setPlaceholder('e.g. 50, 100, 250')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const noteInput = new TextInputBuilder()
          .setCustomId('input_qr_note')
          .setLabel('Payment Description / Note')
          .setPlaceholder('e.g. Tournament Registration')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(amountInput),
          new ActionRowBuilder().addComponents(noteInput)
        );

        return interaction.showModal(modal);
      }

      if (customId === 'btn_pay_my_history') {
        const userPayments = dbQueries.getUserPayments(interaction.user.id);
        if (userPayments.length === 0) {
          return interaction.reply({
            content: 'ℹ️ You do not have any recorded payment submissions yet.',
            ephemeral: true
          });
        }

        const historyList = userPayments.slice(-6).reverse().map(p => {
          const statusEmoji = p.status === 'APPROVED' ? '✅' : p.status === 'REJECTED' ? '❌' : '⏳';
          return `• \`#${p.id}\` — **₹${p.amount}** (${p.purpose}) ➔ ${statusEmoji} \`${p.status}\` (UTR: \`${p.utr}\`)`;
        }).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#00E676')
          .setTitle(`📜 Payment History for ${interaction.user.tag}`)
          .setDescription(`**Your recent payment submissions:**\n\n${historyList}`)
          .setFooter({ text: 'Prime Pay Ledger' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Admin Action: Approve Payment
      if (customId.startsWith('btn_pay_approve_')) {
        const paymentId = parseInt(customId.replace('btn_pay_approve_', ''), 10);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.roles.cache.some(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase());

        if (!isAdmin) {
          return interaction.reply({ content: '🚫 Only Admins can approve payments.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });
        const res = await paymentHandler.approvePayment(client, paymentId, interaction.member);

        if (interaction.message) {
          await interaction.message.edit({ components: [] }).catch(() => null);
        }

        return interaction.editReply({ content: res.message });
      }

      // Admin Action: Reject Payment
      if (customId.startsWith('btn_pay_reject_')) {
        const paymentId = parseInt(customId.replace('btn_pay_reject_', ''), 10);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.roles.cache.some(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase());

        if (!isAdmin) {
          return interaction.reply({ content: '🚫 Only Admins can reject payments.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });
        const res = await paymentHandler.rejectPayment(client, paymentId, interaction.member);

        if (interaction.message) {
          await interaction.message.edit({ components: [] }).catch(() => null);
        }

        return interaction.editReply({ content: res.message });
      }

      // Admin Action: Request More Proof
      if (customId.startsWith('btn_pay_need_proof_')) {
        const paymentId = parseInt(customId.replace('btn_pay_need_proof_', ''), 10);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          interaction.member.roles.cache.some(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase());

        if (!isAdmin) {
          return interaction.reply({ content: '🚫 Only Admins can request proof.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });
        const res = await paymentHandler.requestMoreProof(client, paymentId, interaction.member);
        return interaction.editReply({ content: res.message });
      }

      // 1-Click Game Role Toggle Button
      if (customId.startsWith('btn_game_role_')) {
        const gameKey = customId.replace('btn_game_role_', '');
        await interaction.deferReply({ ephemeral: true });
        const res = await gameRoleHandler.toggleMemberGameRole(interaction.member, gameKey);
        return interaction.editReply({ content: res.message });
      }
    }

    // 3. Handle Select Menus (Ticket Category Selection & Game Roles)
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_ticket_category') {
        const selectedValue = interaction.values[0];
        let categoryName = 'General Support';

        if (selectedValue === 'tournament_support') categoryName = 'Tournament & Payment Support';
        else if (selectedValue === 'general_support') categoryName = 'General Support';
        else if (selectedValue === 'report_support') categoryName = 'Report a User / Cheater';
        else if (selectedValue === 'voice_support') categoryName = 'Voice Support Request';

        await interaction.deferReply({ ephemeral: true });
        const res = await ticketHandler.createTicketChannel(interaction.guild, interaction.member, categoryName);
        if (!res.success) {
          return interaction.editReply({ content: res.message });
        }
        return interaction.editReply({ content: `✅ Ticket created under **${categoryName}**! Go to <#${res.channel.id}>.` });
      }

      // Game Roles Selection Menu
      if (interaction.customId === 'select_game_roles') {
        await interaction.deferReply({ ephemeral: true });
        const selectedKeys = interaction.values;
        const res = await gameRoleHandler.updateMemberGameRoles(interaction.member, selectedKeys);

        if (!res.success) {
          return interaction.editReply({ content: `❌ Failed to update game roles: ${res.message}` });
        }

        const addedText = res.added.length > 0 ? `\n• **Added:** ${res.added.join(', ')}` : '';
        const removedText = res.removed.length > 0 ? `\n• **Removed:** ${res.removed.join(', ')}` : '';
        const noneText = res.added.length === 0 && res.removed.length === 0 ? '\n• No changes made.' : '';

        return interaction.editReply({
          content: `🎮 **Game Roles Updated!**${addedText}${removedText}${noneText}\n\n*Your unlocked game categories & channels are now visible on the server!*`
        });
      }
    }

    // 4. Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      // Tournament Registration Modal Submit
      if (interaction.customId.startsWith('modal_tourney_reg_')) {
        const tournamentId = parseInt(interaction.customId.replace('modal_tourney_reg_', ''), 10);
        const tournament = dbQueries.getTournament(tournamentId);
        const ign = interaction.fields.getTextInputValue('input_ign');
        const squadName = interaction.fields.getTextInputValue('input_squad_name') || 'Solo';
        let teammate = '';
        try {
          teammate = interaction.fields.getTextInputValue('input_teammate') || '';
        } catch {
          teammate = '';
        }

        const mode = tournament?.mode || (tournament?.title.toLowerCase().includes('duo') ? 'duo' : (tournament?.title.toLowerCase().includes('squad') ? 'squad' : 'solo'));
        const fullIgn = teammate ? `${ign} (Teammates: ${teammate})` : ign;
        const formattedSquad = mode === 'duo' ? `${squadName} [Duo]` : (mode === 'squad' ? `${squadName} [Squad]` : squadName);

        await interaction.deferReply({ ephemeral: true });
        const res = await tournamentHandler.registerUser(client, tournamentId, interaction.member, fullIgn, 'Pending', formattedSquad);

        if (!res.success) {
          return interaction.editReply({ content: `❌ ${res.message}` });
        }

        // Calculate updated slot counts & balance teams
        const allParticipants = dbQueries.getParticipants(tournamentId);
        const totalCount = allParticipants.length;
        const maxLimit = tournament ? tournament.max_participants : 8;
        const balanceTeams = Math.max(0, maxLimit - totalCount);

        const effectiveMode = tournament?.mode || (tournament?.game?.toLowerCase().includes('efootball') ? 'solo' : (tournament?.title.toLowerCase().includes('duo') ? 'duo' : (tournament?.title.toLowerCase().includes('squad') ? 'squad' : 'solo')));
        const teamUnit = effectiveMode === 'duo' ? 'Duo Team(s)' : (effectiveMode === 'squad' || effectiveMode === '5v5' || tournament?.game?.toLowerCase().includes('valorant') ? 'Team(s)' : 'Player(s) / Team(s)');

        // 1. Post Live Registration Notification in the Registration Channel
        if (tournament?.dashboard_channel_id) {
          const regChannel = await client.channels.fetch(tournament.dashboard_channel_id).catch(() => null);
          if (regChannel) {
            const balanceText = balanceTeams > 0
              ? `⚡ **Balance Teams That Can Join:** \`${balanceTeams} ${teamUnit} remaining\` (${totalCount}/${maxLimit} registered)`
              : `🔒 **All slots are now filled!** (${totalCount}/${maxLimit}) — Awaiting payment verification.`;

            await regChannel.send({
              content: `📢 🎟️ **NEW TEAM REGISTERED FOR ${tournament.title}!**\n` +
                `• **Team / Duo Name:** \`${formattedSquad}\`\n` +
                `• **Player / Captain:** <@${interaction.user.id}>\n` +
                `• **IGN Registered:** \`${fullIgn}\`\n` +
                `• ${balanceText}\n\n` +
                (balanceTeams > 0 ? `👉 Click the **"Register for Tournament"** button on the dashboard above to claim your slot!` : `*If any pending payment is rejected by admin, the slot opens back up automatically!*`)
            }).catch(() => null);
          }
        }

        // 2. Send payment-assisted registration form & gateway selector directly to the player's DM from Payment Bot
        let dmSuccess = false;
        let dmSender = "PLE Payments' bot";
        if (tournament) {
          const dmPayload = paymentEmbeds.createTournamentAssistedDmPayload(
            tournament,
            interaction.user,
            { ingame_id: fullIgn, squad_name: formattedSquad, teammate }
          );
          const sendRes = await paymentBotService.sendDm(interaction.user.id, dmPayload, client);
          dmSuccess = sendRes.success;
          if (sendRes.sender) dmSender = sendRes.sender;
        }

        const dmStatusNote = dmSuccess
          ? `👉 **Payment invoice sent to your DM by \`${dmSender}\`!**\nPlease check your Direct Messages to pay and confirm your slot.`
          : `⚠️ **Could not send DM!** Please enable **"Direct Messages from server members"** in your Discord Privacy Settings so **PLE Payments Bot** can deliver your invoice, or contact Support.`;

        return interaction.editReply({
          content: `✅ **Registration submitted for ${tournament ? tournament.title : 'Tournament'}!**\n` +
            `• **Team / Duo Name:** \`${formattedSquad}\`\n` +
            `• **IGNs Registered:** \`${fullIgn}\`\n` +
            `• ⚡ **Balance Teams That Can Join:** \`${balanceTeams} ${teamUnit} remaining\` (${totalCount}/${maxLimit} registered)\n\n` +
            dmStatusNote
        });
      }

      // Tournament Close Modal Submit
      if (interaction.customId.startsWith('modal_tourney_close_')) {
        const tournamentId = parseInt(interaction.customId.replace('modal_tourney_close_', ''), 10);
        const winner = interaction.fields.getTextInputValue('input_winner');
        const deleteResp = (interaction.fields.getTextInputValue('input_delete_channels') || 'no').toLowerCase();
        const deleteChannels = ['yes', 'y', 'true', '1'].includes(deleteResp);

        await interaction.deferReply({ ephemeral: true });
        const res = await tournamentHandler.closeTournament(client, tournamentId, interaction.member, winner, deleteChannels);
        if (!res.success) {
          return interaction.editReply({ content: `❌ ${res.message}` });
        }

        return interaction.editReply({
          content: `✅ ${res.message}\n` +
            (deleteChannels ? '🧹 Event channels have been deleted.' : '📁 Event channels preserved.')
        });
      }

      // Payment Proof Submission Modal (Supports submissions from DM and Server)
      if (interaction.customId === 'modal_submit_payment_proof') {
        const utr = interaction.fields.getTextInputValue('input_pay_utr');
        const amount = interaction.fields.getTextInputValue('input_pay_amount');
        const purpose = interaction.fields.getTextInputValue('input_pay_purpose');
        const proofUrl = interaction.fields.getTextInputValue('input_pay_proof_url') || '';

        await interaction.deferReply({ ephemeral: true });

        const targetGuild = interaction.guild || client.guilds.cache.first();
        let targetMember = interaction.member;
        if (!targetMember && targetGuild) {
          targetMember = await targetGuild.members.fetch(interaction.user.id).catch(() => null);
        }

        const res = await paymentHandler.submitPaymentProof(
          client,
          targetGuild,
          targetMember || { id: interaction.user.id, user: interaction.user, guild: targetGuild },
          {
            amount,
            utr,
            purpose,
            screenshotUrl: proofUrl.startsWith('http') ? proofUrl : null
          }
        );
        const extraNote = (!proofUrl || !proofUrl.startsWith('http'))
          ? '\n\n📸 **Next Step:** You can now **upload your payment screenshot (JPG/PNG)** directly in this chat or DM, and the bot will link it to this payment!'
          : '';

        return interaction.editReply({ content: `${res.message}${extraNote}` });
      }

      // Custom QR Code Generation Modal (Delivers to DM via Payment Bot)
      if (interaction.customId === 'modal_generate_custom_qr') {
        const amount = interaction.fields.getTextInputValue('input_qr_amount');
        const note = interaction.fields.getTextInputValue('input_qr_note') || 'Prime Lobby Payment';

        const dmPayload = paymentEmbeds.createDmPaymentQrPayload(amount, note, interaction.user);
        const sendRes = await paymentBotService.sendDm(interaction.user.id, dmPayload, client);
        if (sendRes.success) {
          return interaction.reply({
            content: `📬 Generated your private QR code for **₹${amount}** and sent it directly from **PLE Payments Bot** to your **Direct Messages (DM)**!`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: `⚠️ Could not send DM! Please ensure Direct Messages are enabled in your Privacy settings.\nHere is your QR code:`,
            ...dmPayload,
            ephemeral: true
          });
        }
      }
    }
  }
};
