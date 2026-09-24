const { ChannelType, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { dbQueries } = require('../database/db');
const paymentEmbeds = require('../utils/paymentEmbeds');
const paymentBotService = require('../utils/paymentBotService');
const config = require('../../config.json');

const paymentHandler = {
  /**
   * Sets up the Payment and Admin Verification channels:
   * 1. Public Payment Channel: #💳-payment-desk (Accessible by all members to view QR & submit proofs)
   * 2. Admin Category ("🛡️ ADMIN CATEGORY"):
   *    - #🛡️-payment-verification (Private verification desk strictly for Admins/Staff)
   *    - #🧾-payment-ledger-logs (Financial accounting & invoice logs)
   */
  setupPaymentCategory: async (guild) => {
    try {
      await guild.roles.fetch().catch(() => null);
      await guild.channels.fetch().catch(() => null);

      const adminRole = guild.roles.cache.find(
        r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase()
      );

      // 1. Create or find Category "💳 PAYMENTS" for public payment desk
      let paymentCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && (c.name.toUpperCase().includes('PAYMENT') || c.name.toUpperCase().includes('BILLING'))
      );

      if (!paymentCategory) {
        paymentCategory = await guild.channels.create({
          name: config.categories.payments || '💳 PAYMENTS',
          type: ChannelType.GuildCategory
        });
      }

      // 2. Setup #💳-payment-desk (Public Read-Only with Interactive Buttons)
      const deskOverwrites = [
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
        deskOverwrites.push({
          id: adminRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        });
      }

      let paymentDesk = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && (
          c.name === 'payment-desk' ||
          c.name === '💳-payment-desk' ||
          c.name === 'payments' ||
          c.name === '💳-payments'
        )
      );

      if (!paymentDesk) {
        paymentDesk = await guild.channels.create({
          name: '💳-payment-desk',
          type: ChannelType.GuildText,
          parent: paymentCategory.id,
          topic: 'Official Scan-to-Pay UPI QR Codes & Payment Verification Desk',
          permissionOverwrites: deskOverwrites
        });
      } else {
        await paymentDesk.setParent(paymentCategory.id).catch(() => null);
        await paymentDesk.permissionOverwrites.set(deskOverwrites).catch(() => null);
      }

      // Post Payment Desk Panel with live tournament status
      const activeTourneys = dbQueries.getActiveTournaments(guild.id).filter(t => t.status === 'OPEN');
      const enrichedTourneys = activeTourneys.map(t => ({
        ...t,
        participant_count: dbQueries.getParticipantCount(t.id)
      }));
      const deskPayload = paymentEmbeds.createPaymentDeskEmbed(enrichedTourneys);
      await paymentDesk.send(deskPayload);

      // 3. Create or find Admin Category "🛡️ ADMIN CATEGORY" (Hidden from regular members)
      const adminCatName = config.categories.admin || '🛡️ ADMIN CATEGORY';
      let adminCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && (
          c.name.toUpperCase().includes('ADMIN') ||
          c.name.toUpperCase().includes('MANAGEMENT') ||
          c.name.toUpperCase().includes('STAFF')
        )
      );

      const adminCategoryOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.Connect
          ]
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages
          ]
        }
      ];

      if (adminRole) {
        adminCategoryOverwrites.push({
          id: adminRole.id,
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

      if (!adminCategory) {
        adminCategory = await guild.channels.create({
          name: adminCatName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: adminCategoryOverwrites
        });
      } else {
        await adminCategory.permissionOverwrites.set(adminCategoryOverwrites).catch(() => null);
      }

      // 4. Setup ONE verification channel inside Admin Category: #🛡️-payment-verification
      let adminControlChannel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && (
          c.name === 'payment-verification' ||
          c.name === '🛡️-payment-verification' ||
          c.name === 'admin-payment-control' ||
          c.name === '🛡️-admin-payment-control' ||
          c.name === 'admin-payments'
        )
      );

      if (!adminControlChannel) {
        adminControlChannel = await guild.channels.create({
          name: '🛡️-payment-verification',
          type: ChannelType.GuildText,
          parent: adminCategory.id,
          topic: 'Private Admin Desk for Payment Verification & Screenshot Approvals',
          permissionOverwrites: adminCategoryOverwrites
        });
      } else {
        await adminControlChannel.setName('🛡️-payment-verification').catch(() => null);
        await adminControlChannel.setParent(adminCategory.id).catch(() => null);
        await adminControlChannel.permissionOverwrites.set(adminCategoryOverwrites).catch(() => null);
      }

      // 5. Setup #🧾-payment-ledger-logs inside Admin Category
      let ledgerChannel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && (
          c.name === 'payment-ledger-logs' ||
          c.name === '🧾-payment-ledger-logs' ||
          c.name === 'ledger-logs'
        )
      );

      if (!ledgerChannel) {
        ledgerChannel = await guild.channels.create({
          name: '🧾-payment-ledger-logs',
          type: ChannelType.GuildText,
          parent: adminCategory.id,
          topic: 'Financial Accounting & Automated Digital Invoice Records',
          permissionOverwrites: adminCategoryOverwrites
        });
      } else {
        await ledgerChannel.setParent(adminCategory.id).catch(() => null);
        await ledgerChannel.permissionOverwrites.set(adminCategoryOverwrites).catch(() => null);
      }

      return {
        success: true,
        paymentCategory,
        adminCategory,
        paymentDesk,
        adminControlChannel,
        ledgerChannel
      };
    } catch (err) {
      console.error('[PaymentManager] Error setting up payment category:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Ensures the private admin payment verification channel exists.
   */
  ensureAdminPaymentChannel: async (guild) => {
    if (!guild) return null;

    // 1. Check saved guild settings first
    const settings = dbQueries.getGuildSettings(guild.id);
    if (settings && settings.admin_verification_channel_id && typeof guild.channels?.fetch === 'function') {
      const channel = await guild.channels.fetch(settings.admin_verification_channel_id).catch(() => null);
      if (channel) return channel;
    }

    // 2. Search in cache
    let channel = guild.channels?.cache?.find(
      c => c.type === ChannelType.GuildText && (
        c.name === 'payment-verification' ||
        c.name === '🛡️-payment-verification' ||
        c.name === 'admin-payment-control' ||
        c.name === '🛡️-admin-payment-control' ||
        c.name === 'admin-payments'
      )
    );

    // 3. Fallback search via fetch if not cached
    if (!channel && typeof guild.channels?.fetch === 'function') {
      const fetched = await guild.channels.fetch().catch(() => null);
      if (fetched) {
        channel = fetched.find(
          c => c && c.type === ChannelType.GuildText && (
            c.name === 'payment-verification' ||
            c.name === '🛡️-payment-verification' ||
            c.name === 'admin-payment-control' ||
            c.name === '🛡️-admin-payment-control' ||
            c.name === 'admin-payments'
          )
        );
      }
    }

    if (!channel) {
      const res = await paymentHandler.setupPaymentCategory(guild).catch(() => null);
      return res ? res.adminControlChannel : null;
    }
    return channel;
  },

  /**
   * Refreshes and updates the public #💳-payment-desk message with current tournament availability.
   */
  updatePaymentDesk: async (guild) => {
    try {
      const settings = dbQueries.getGuildSettings(guild.id);
      let paymentDesk = null;
      if (settings && settings.payment_desk_id) {
        paymentDesk = await guild.channels.fetch(settings.payment_desk_id).catch(() => null);
      }
      if (!paymentDesk) {
        paymentDesk = guild.channels.cache.find(
          c => c.type === ChannelType.GuildText && (
            c.name === 'payment-desk' ||
            c.name === '💳-payment-desk' ||
            c.name === 'payments' ||
            c.name === '💳-payments'
          )
        );
      }
      if (!paymentDesk) return { success: false, message: 'Payment desk channel not found.' };

      // Fetch active tournaments
      const activeTourneys = dbQueries.getActiveTournaments(guild.id).filter(t => t.status === 'OPEN');
      const enrichedTourneys = activeTourneys.map(t => ({
        ...t,
        participant_count: dbQueries.getParticipantCount(t.id)
      }));

      const payload = paymentEmbeds.createPaymentDeskEmbed(enrichedTourneys);

      // Check existing bot messages in channel
      const messages = await paymentDesk.messages.fetch({ limit: 10 }).catch(() => null);
      const existingBotMsg = messages ? messages.find(m => m.author.id === guild.client.user.id) : null;

      if (existingBotMsg) {
        await existingBotMsg.edit(payload);
      } else {
        await paymentDesk.send(payload);
      }
      return { success: true, message: 'Payment desk updated successfully.' };
    } catch (err) {
      console.error('[PaymentManager] Error updating payment desk:', err);
      return { success: false, message: err.message };
    }
  },

  /**
   * Submits payment verification proof with support for JPG, JPEG, PNG, and WEBP screenshots.
   */
  submitPaymentProof: async (client, guild, member, options) => {
    let { amount, utr, screenshotUrl, purpose, tournamentId, gatewayType } = options;


    const targetGuild = guild || client.guilds.cache.first();
    if (!targetGuild) {
      return { success: false, message: '❌ Server not found for payment processing.' };
    }

    const userId = member?.id || member?.user?.id || options?.userId;
    const username = member?.user?.tag || member?.user?.username || member?.username || 'User';

    // Validate Tournament Status if tournamentId is specified
    if (tournamentId) {
      const tourney = dbQueries.getTournament(tournamentId);
      if (!tourney) {
        return {
          success: false,
          message: `❌ Tournament with ID \`#${tournamentId}\` was not found. Please verify the tournament ID or leave blank.`
        };
      }
      if (tourney.status !== 'OPEN') {
        return {
          success: false,
          message: `❌ Tournament **#${tournamentId} (${tourney.title})** is \`${tourney.status}\`. Registration and entry fee payments are closed.`
        };
      }
      const confirmedCount = dbQueries.getParticipantCount(tournamentId);
      if (confirmedCount >= tourney.max_participants) {
        return {
          success: false,
          message: `❌ Tournament **#${tournamentId} (${tourney.title})** has already reached full capacity (${tourney.max_participants}/${tourney.max_participants} players).`
        };
      }
    } else {
      // If no tournamentId was specified, check if there is an active tournament to auto-link
      const activeTourneys = dbQueries.getActiveTournaments(targetGuild.id).filter(t => t.status === 'OPEN');
      if (activeTourneys.length > 0) {
        tournamentId = activeTourneys[0].id;
      }
    }

    // Validate duplicate UTR
    if (utr && utr !== 'N/A') {
      const existing = dbQueries.getPaymentByUtr(utr);
      if (existing && existing.status === 'APPROVED') {
        return {
          success: false,
          message: `❌ This UPI / UTR Reference (\`${utr}\`) has already been verified and approved for payment #${existing.id}.`
        };
      }
    }

    try {
      // Auto-detect pending tournament registration for this user
      let linkedTourneyId = tournamentId || null;
      let gameId = null;
      let squadName = null;

      const tournaments = typeof dbQueries.getTournaments === 'function' ? dbQueries.getTournaments() : [];
      for (const t of tournaments) {
        if (t.status === 'OPEN') {
          const pending = typeof dbQueries.getPendingParticipants === 'function' ? dbQueries.getPendingParticipants(t.id) : [];
          const matched = pending.find(p => p.user_id === userId);
          if (matched) {
            linkedTourneyId = t.id;
            gameId = matched.ingame_id;
            squadName = matched.squad_name;
            break;
          }
        }
      }

      // 1. Create Payment in DB
      const payment = dbQueries.createPayment({
        guild_id: targetGuild.id,
        user_id: userId,
        username: username,
        amount: amount || '0',
        utr: utr || 'N/A',
        screenshot_url: screenshotUrl || null,
        purpose: purpose || (linkedTourneyId ? `Tournament #${linkedTourneyId} Entry Fee` : 'Tournament Entry / Service'),
        tournament_id: linkedTourneyId,
        game_id: gameId,
        squad_name: squadName,
        gateway_type: gatewayType || 'DOMESTIC'
      });


      // 2. Post Alert in #🛡️-payment-verification with JPG/PNG Screenshot
      const adminChan = await paymentHandler.ensureAdminPaymentChannel(targetGuild);
      if (adminChan) {
        const alertPayload = paymentEmbeds.createAdminPaymentAlertEmbed(payment);
        await adminChan.send({
          content: `🔔 **New Payment Verification Request!** ID: \`#${payment.id}\` from <@${userId}> | Amount: \`₹${payment.amount}\` (UTR: \`${payment.utr}\`)`,
          ...alertPayload
        });
      }

      return {
        success: true,
        payment,
        message: `✅ **Payment Proof Submitted!**\n\n` +
          `• **Payment ID:** \`#${payment.id}\`\n` +
          `• **Amount:** \`₹${payment.amount}\`\n` +
          `• **UTR Reference:** \`${payment.utr}\`\n` +
          `• **Screenshot:** ${screenshotUrl ? '📸 Attached (JPG/PNG)' : 'None provided'}\n` +
          `• **Status:** \`PENDING ADMIN VERIFICATION\`\n\n` +
          `*Admins have received your submission in the Payment Control Desk. You will receive an official Digital Invoice in your DMs upon approval!*`
      };
    } catch (err) {
      console.error('[PaymentManager] Error submitting payment:', err);
      return { success: false, message: `Submission failed: ${err.message}` };
    }
  },

  /**
   * Approves a payment, issues official digital invoice, and logs to the financial ledger.
   */
  approvePayment: async (client, paymentId, adminMember, note = '') => {
    const payment = dbQueries.getPayment(paymentId);
    if (!payment) {
      return { success: false, message: 'Payment record not found.' };
    }

    if (payment.status === 'APPROVED') {
      return { success: false, message: `Payment #${paymentId} is already approved!` };
    }

    const guild = adminMember.guild;
    const targetMember = await guild.members.fetch(payment.user_id).catch(() => null);

    try {
      // 1. Update DB & generate Invoice
      const result = dbQueries.approvePaymentRecord(paymentId, adminMember.id, note);
      if (!result) return { success: false, message: 'Failed to update payment record.' };

      const { invoice } = result;

      // 2. Send Digital Invoice via DM to player from Payment Bot
      if (targetMember) {
        const invoicePayload = paymentEmbeds.createInvoiceEmbed(invoice);
        await paymentBotService.sendDm(
          targetMember.id,
          {
            content: `🎉 **Payment Verified & Approved! Here is your official invoice:**`,
            ...invoicePayload
          },
          client
        );
      }

      // 3. Log to #🧾-payment-ledger-logs
      const ledgerChan = guild.channels.cache.find(
        c => c.name === 'payment-ledger-logs' || c.name === '🧾-payment-ledger-logs'
      );
      if (ledgerChan) {
        const invoicePayload = paymentEmbeds.createInvoiceEmbed(invoice);
        await ledgerChan.send({
          content: `🧾 **Invoice \`${invoice.invoice_id}\` Issued** by <@${adminMember.id}> for <@${payment.user_id}> | Amount: \`₹${payment.amount}\``,
          ...invoicePayload
        }).catch(() => null);
      }

      // 4. If tied to a tournament, automatically confirm tournament registration & role
      if (payment.tournament_id) {
        const tournamentHandler = require('./tournamentHandler');
        await tournamentHandler.approvePayment(client, payment.tournament_id, payment.user_id, adminMember).catch(() => null);
      }

      return {
        success: true,
        invoice,
        message: `✅ **Payment #${paymentId} APPROVED!**\n` +
          `• **Invoice Issued:** \`${invoice.invoice_id}\`\n` +
          `• **Player:** <@${payment.user_id}>\n` +
          `• **Amount:** \`₹${payment.amount}\`\n` +
          `• **Status:** Logged to <#${ledgerChan ? ledgerChan.id : 'ledger'}> & DM sent to player.`
      };
    } catch (err) {
      console.error('[PaymentManager] Error approving payment:', err);
      return { success: false, message: `Approval failed: ${err.message}` };
    }
  },

  /**
   * Rejects a payment.
   */
  rejectPayment: async (client, paymentId, adminMember, reason = 'Invalid transaction reference') => {
    const payment = dbQueries.getPayment(paymentId);
    if (!payment) return { success: false, message: 'Payment record not found.' };

    const guild = adminMember.guild;
    const targetMember = await guild.members.fetch(payment.user_id).catch(() => null);

    try {
      dbQueries.rejectPaymentRecord(paymentId, adminMember.id, reason);

      if (targetMember) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
        const rejectEmbed = new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle(`❌ Payment Verification Rejected — #${paymentId}`)
          .setDescription(
            `Your payment submission was reviewed and rejected by the admin team.\n\n` +
            `• **Payment ID:** \`#${paymentId}\`\n` +
            `• **Amount:** \`₹${payment.amount}\`\n` +
            `• **Reason for Rejection:** \`${reason}\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💬 **Need Help or Dispute this Decision?**\n` +
            `Click the **"Open Support Ticket"** button below to immediately open a private support ticket with server staff.`
          )
          .setFooter({ text: `${guild.name} Billing Support` })
          .setTimestamp();

        const ticketRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_dm_open_ticket_reject_${paymentId}_${guild.id}`)
            .setLabel('Open Support Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🎫')
        );

        await paymentBotService.sendDm(
          targetMember.id,
          {
            embeds: [rejectEmbed],
            components: [ticketRow]
          },
          client
        );
      }

      if (payment.tournament_id) {
        const tournamentHandler = require('./tournamentHandler');
        await tournamentHandler.rejectPayment(client, payment.tournament_id, payment.user_id, adminMember).catch(() => null);
      }

      return {
        success: true,
        message: `❌ Payment **#${paymentId}** was rejected. Reason: \`${reason}\` (Ticket option sent to player DM)`
      };
    } catch (err) {
      return { success: false, message: `Rejection failed: ${err.message}` };
    }
  },

  /**
   * Requests clearer screenshot or UTR from user.
   */
  requestMoreProof: async (client, paymentId, adminMember, note = 'Please provide a clear screenshot (JPG/PNG) showing the 12-digit UTR') => {
    const payment = dbQueries.getPayment(paymentId);
    if (!payment) return { success: false, message: 'Payment record not found.' };

    const guild = adminMember.guild;
    const targetMember = await guild.members.fetch(payment.user_id).catch(() => null);

    try {
      dbQueries.requestMoreProofRecord(paymentId, adminMember.id, note);

      if (targetMember) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
        const proofEmbed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle(`⚠️ Action Required: Additional Proof Needed — #${paymentId}`)
          .setDescription(
            `Our admin reviewed your payment submission and requested additional clarification:\n\n` +
            `💬 **Admin Note:** \`${note}\`\n\n` +
            `Please re-submit your proof screenshot (JPG / PNG) with the 12-digit UTR visible.\n` +
            `You can click **"Submit Proof"** below or use \`/pay submit\` in chat.`
          )
          .setTimestamp();

        const proofRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_pay_submit_for_${payment.amount}`)
            .setLabel('Submit Clear Proof')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🧾'),
          new ButtonBuilder()
            .setCustomId(`btn_dm_open_ticket_proof_${paymentId}_${guild.id}`)
            .setLabel('Need Staff Help (Ticket)')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎫')
        );

        await paymentBotService.sendDm(
          targetMember.id,
          {
            embeds: [proofEmbed],
            components: [proofRow]
          },
          client
        );
      }

      return {
        success: true,
        message: `⚠️ Notified <@${payment.user_id}> that additional payment proof (JPG/PNG) is required.`
      };
    } catch (err) {
      return { success: false, message: `Failed to request proof: ${err.message}` };
    }
  }
};

module.exports = paymentHandler;
