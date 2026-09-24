const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const config = require('../../config.json');

const DOMESTIC_UPI_ID = config.payment?.upiId || 'sinoprince366-1@okhdfcbank';
const INTERNATIONAL_UPI_ID = config.payment?.internationalUpiId || 'sinoprince366-1@oksbi';

const paymentEmbeds = {
  getUpiQrCodeUrl: (amount = null, note = 'Prime Lobby Payment', upiId = DOMESTIC_UPI_ID) => {
    let upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('Prime Lobby Esports')}&cu=INR`;
    if (amount) {
      upiUri += `&am=${encodeURIComponent(amount)}`;
    }
    if (note) {
      upiUri += `&tn=${encodeURIComponent(note)}`;
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiUri)}`;
  },

  // Clean Interactive Payment Desk Embed (No public QR code; QR is sent to DM)
  createPaymentDeskEmbed: (activeTournaments = []) => {
    let tournamentStatusBlock = '';
    const openTournaments = (activeTournaments || []).filter(t => t.status === 'OPEN');

    if (openTournaments.length > 0) {
      const tourneyList = openTournaments.map(t => {
        const count = t.participant_count || 0;
        const balance = Math.max(0, t.max_participants - count);
        const isFull = count >= t.max_participants;
        return `• **[#${t.id}] ${t.title}** (\`${t.game}\`)\n` +
               `  💰 Entry Fee: \`${t.entry_fee}\` | 👥 Booked: \`${count}/${t.max_participants}\` | 🎟️ **Slot Balance:** \`${balance} remaining\` ${isFull ? '🔴 *(FULL)*' : '🟢 *(OPEN)*'}`;
      }).join('\n\n');

      tournamentStatusBlock =
        `### 🏆 Live Tournaments & Slot Balance:\n` +
        `🟢 **REGISTRATION & PAYMENTS ACTIVE**\n\n` +
        `${tourneyList}\n\n` +
        `📌 *Slots are booked upon payment approval. If rejected, the slot is immediately released back to balance!*\n` +
        `👉 *Head over to the game's announcement channel to register, or click below for private QR code.*\n\n`;
    } else {
      tournamentStatusBlock =
        `### 🏆 Live Tournament Registration Status:\n` +
        `🔴 **NO ACTIVE TOURNAMENT HOSTED (Entry Payments Locked)**\n` +
        `• Tournament entry payments are currently **DISABLED**.\n` +
        `• The bot will **NOT take money** until an Admin officially hosts a tournament using \`/tournament\`.\n\n`;
    }

    const embed = new EmbedBuilder()
      .setColor(openTournaments.length > 0 ? '#00E676' : '#2979FF')
      .setTitle('💳 Prime Lobby Esports — Official Payment & Billing Desk')
      .setDescription(
        `Welcome to the official **Payment & Verification Hub**.\n\n` +
        tournamentStatusBlock +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 🏦 Official Payment Gateways:\n` +
        `• 🇮🇳 **Domestic / India UPI (GPay / PhonePe / Paytm):**\n` +
        `\`\`\`\n${DOMESTIC_UPI_ID}\n\`\`\`\n` +
        `• 🌐 **International Receive UPI (Cross-Border / NRI):**\n` +
        `\`\`\`\n${INTERNATIONAL_UPI_ID}\n\`\`\`\n` +
        `• **Beneficiary / Name:** \`Prime Lobby Esports\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 📲 How to Pay Privately via DM:\n` +
        `1. Click one of the buttons below to receive your **Scan-to-Pay QR Code directly in your DMs**.\n` +
        `2. Complete your payment on Google Pay, PhonePe, or Paytm.\n` +
        `3. Submit your **12-digit UTR** and **screenshot proof directly from your DM**.\n` +
        `4. Our admin team will verify and issue your **Official Digital Invoice** immediately!`
      )
      .setFooter({ text: 'Click below to receive your QR code privately in your DMs' })
      .setTimestamp();

    const activeEfootball = openTournaments.find(t => t.game && t.game.toLowerCase().includes('efootball'));
    const efootballFee = activeEfootball?.entry_fee ? (activeEfootball.entry_fee.replace(/[^0-9]/g, '') || '250') : '250';

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_pay_dm_domestic_qr')
        .setLabel('🇮🇳 Domestic UPI QR (DM)')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🇮🇳'),
      new ButtonBuilder()
        .setCustomId('btn_pay_dm_international_qr')
        .setLabel('🌐 International QR (DM)')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🌐'),
      new ButtonBuilder()
        .setCustomId('btn_pay_dm_efootball_qr')
        .setLabel(activeEfootball ? `⚽ eFootball ₹${efootballFee} QR (DM)` : '⚽ eFootball (No Active Cup)')
        .setStyle(activeEfootball ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('⚽')
    );

    const secondRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_pay_generate_custom_qr')
        .setLabel('Custom Amount QR (DM)')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📲'),
      new ButtonBuilder()
        .setCustomId('btn_pay_open_submit_modal')
        .setLabel('Submit Payment Proof')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🧾'),
      new ButtonBuilder()
        .setCustomId('btn_pay_my_history')
        .setLabel('My Payment History')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📜')
    );

    return { embeds: [embed], components: [row, secondRow] };
  },

  // Instant Custom QR Code Embed
  createCustomQrEmbed: (amount, note, requesterUser, isInternational = false) => {
    const selectedUpi = isInternational ? INTERNATIONAL_UPI_ID : DOMESTIC_UPI_ID;
    const label = isInternational ? '🌐 International Receive UPI (SBI)' : '🇮🇳 Domestic UPI (HDFC)';
    const qrUrl = paymentEmbeds.getUpiQrCodeUrl(amount, note, selectedUpi);

    const embed = new EmbedBuilder()
      .setColor(isInternational ? '#7C4DFF' : '#00B0FF')
      .setTitle(`📲 Scan to Pay — ₹${amount} (${isInternational ? 'International' : 'Domestic'})`)
      .setDescription(
        `**Payment Request Details:**\n\n` +
        `💰 **Amount:** \`₹${amount}\`\n` +
        `📝 **Purpose / Note:** \`${note}\`\n` +
        `🏦 **Gateway:** \`${label}\`\n` +
        `💳 **UPI ID:** \`${selectedUpi}\`\n` +
        `👤 **Generated for:** <@${requesterUser.id}>\n\n` +
        `*Scan with **Google Pay, PhonePe, Paytm, or BHIM UPI** to complete payment.*`
      )
      .setImage(qrUrl)
      .setFooter({ text: 'Once paid, click "Submit Payment Proof" to verify!' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_pay_submit_for_${amount}`)
        .setLabel(`Submit UTR for ₹${amount}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('🧾')
    );

    return { embeds: [embed], components: [row] };
  },

  // Private DM QR Code Payload for Users
  createDmPaymentQrPayload: (amount = null, note = 'Prime Lobby Payment', requesterUser, isInternational = false, tournamentId = null) => {
    const selectedUpi = isInternational ? INTERNATIONAL_UPI_ID : DOMESTIC_UPI_ID;
    const label = isInternational ? '🌐 International Receive UPI (SBI)' : '🇮🇳 Domestic UPI (HDFC)';
    const qrUrl = paymentEmbeds.getUpiQrCodeUrl(amount, note, selectedUpi);

    const embed = new EmbedBuilder()
      .setColor(isInternational ? '#7C4DFF' : '#00E676')
      .setTitle(`📲 Prime Pay — Your Private Scan-to-Pay QR Code`)
      .setDescription(
        `Hello <@${requesterUser.id}>,\n\n` +
        `Here is your private payment QR code.\n\n` +
        (amount ? `💰 **Amount to Pay:** \`₹${amount}\`\n` : '') +
        (tournamentId ? `🏆 **Tournament Ref:** \`#${tournamentId}\`\n` : '') +
        `📝 **Description:** \`${note}\`\n` +
        `🏦 **Gateway:** \`${label}\`\n` +
        `💳 **Official UPI ID:**\n\`\`\`\n${selectedUpi}\n\`\`\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 📌 Next Steps:\n` +
        `1. Scan this QR code with **Google Pay, PhonePe, or Paytm**.\n` +
        `2. Complete your payment and note down your **12-digit UTR number**.\n` +
        `3. Click **"Submit Payment Proof"** below to submit your UTR & proof right here in DM!\n` +
        `*(You can also use \`/pay submit\` in chat to attach your JPG/PNG screenshot directly)*`
      )
      .setImage(qrUrl)
      .setFooter({ text: 'Prime Pay Private Gateway • Direct DM Delivery' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(amount ? `btn_pay_submit_for_${amount}` : 'btn_pay_open_submit_modal')
        .setLabel(amount ? `Submit UTR for ₹${amount}` : 'Submit Payment Proof')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🧾')
    );

    return { embeds: [embed], components: [row] };
  },

  // Interactive DM Assisted Registration Embed
  createTournamentAssistedDmPayload: (tournament, requesterUser, regData = {}) => {
    const fee = tournament.entry_fee || '250';
    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle(`🏆 Registration Confirmed: ${tournament.title}`)
      .setDescription(
        `Hello <@${requesterUser.id}>!\n\n` +
        `Your tournament registration details have been received:\n` +
        `• **Tournament:** **#${tournament.id} — ${tournament.title}** (\`${tournament.game}\`)\n` +
        `• **In-Game ID / IGN:** \`${regData.ingame_id || 'Not specified'}\`\n` +
        `• **Squad / Team Name:** \`${regData.squad_name || 'Solo'}\`\n` +
        `• **Entry Fee to Pay:** 💰 **₹${fee}**\n` +
        `• **1st Prize Reward:** 🥇 **${tournament.prize_pool || '₹1,500 Instant Cash'}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 🏦 Select Your Payment Gateway:\n` +
        `Choose your payment method below to view the scan-to-pay QR code and payment address:\n` +
        `• 🇮🇳 **Domestic Gateway:** UPI (Google Pay, PhonePe, Paytm, BHIM)\n` +
        `• 🌐 **International Gateway:** Cross-border UPI / Card / PayPal receive\n\n` +
        `### 📸 How to Submit Proof:\n` +
        `Once paid, simply **drag & drop your payment screenshot (JPG/PNG) into this DM**, or click **[ 🧾 Submit Proof ]** below to enter your 12-digit UTR!`
      )
      .setFooter({ text: 'PLE Payments • Official Tournament Billing' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_pay_dm_reg_dom_${tournament.id}_${fee}`)
        .setLabel(`🇮🇳 Domestic UPI (₹${fee})`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🇮🇳'),
      new ButtonBuilder()
        .setCustomId(`btn_pay_dm_reg_intl_${tournament.id}_${fee}`)
        .setLabel(`🌐 International (₹${fee})`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🌐'),
      new ButtonBuilder()
        .setCustomId(`btn_pay_submit_for_${fee}_t_${tournament.id}`)
        .setLabel('🧾 Submit Proof')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🧾')
    );

    return { embeds: [embed], components: [row] };
  },

  // Admin Payment Verification Alert Embed
  createAdminPaymentAlertEmbed: (payment) => {
    const embed = new EmbedBuilder()
      .setColor('#FF9800')
      .setTitle(`🔔 Payment Verification Required — #${payment.id}`)
      .setDescription(
        `A player has submitted payment verification proof.\n\n` +
        `👤 **Player:** <@${payment.user_id}> (\`${payment.username}\`)\n` +
        (payment.game_id ? `🎮 **In-Game ID / IGN:** \`${payment.game_id}\`\n` : '') +
        (payment.squad_name ? `👥 **Squad Name:** \`${payment.squad_name}\`\n` : '') +
        `💰 **Amount:** \`₹${payment.amount}\`\n` +
        `🎯 **Purpose:** \`${payment.purpose}\`\n` +
        (payment.tournament_id ? `🏆 **Tournament ID:** \`#${payment.tournament_id}\`\n` : '') +
        `🌐 **Gateway Type:** \`${payment.gateway_type || 'DOMESTIC'}\`\n` +
        `🧾 **UPI / UTR Reference:**\n\`\`\`\n${payment.utr}\n\`\`\`\n` +
        `🏦 **Authorized UPI Accounts:**\n` +
        `• 🇮🇳 Domestic: \`${DOMESTIC_UPI_ID}\`\n` +
        `• 🌐 International: \`${INTERNATIONAL_UPI_ID}\`\n\n` +
        `📊 **Status:** \`PENDING REVIEW\`\n` +
        `⏰ **Submitted:** <t:${Math.floor(new Date(payment.created_at).getTime() / 1000)}:R>`
      )
      .setThumbnail(paymentEmbeds.getUpiQrCodeUrl(payment.amount))
      .setTimestamp();

    if (payment.screenshot_url) {
      embed.setImage(payment.screenshot_url);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_pay_approve_${payment.id}`)
        .setLabel('Approve & Confirm Slot')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`btn_pay_reject_${payment.id}`)
        .setLabel('Reject Registration')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
      new ButtonBuilder()
        .setCustomId(`btn_pay_need_proof_${payment.id}`)
        .setLabel('Request Clear Proof')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚠️')
    );

    return { embeds: [embed], components: [row] };
  },

  // Official Digital Invoice Embed
  createInvoiceEmbed: (invoice) => {
    const embed = new EmbedBuilder()
      .setColor('#00E676')
      .setTitle(`🧾 OFFICIAL PAYMENT RECEIPT — ${invoice.invoice_id}`)
      .setDescription(
        `### ✅ PAYMENT VERIFIED & CONFIRMED\n\n` +
        `**Invoice Number:** \`${invoice.invoice_id}\`\n` +
        `**Payment Ref ID:** \`#${invoice.payment_id}\`\n` +
        `**Billed To:** <@${invoice.user_id}> (\`${invoice.username}\`)\n` +
        `**Payment Mode:** \`UPI (GPay / PhonePe / Paytm / Bank)\`\n` +
        `**Recipient UPI Gateway:** \`${DOMESTIC_UPI_ID}\` / \`${INTERNATIONAL_UPI_ID}\`\n` +
        `**UTR / Transaction Ref:** \`${invoice.utr}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**ITEMIZED PARTICULARS:**\n` +
        `• **Description:** \`${invoice.purpose}\`\n` +
        `• **Status:** \`PAID IN FULL ✅\`\n` +
        `• **Total Amount:** \`₹${invoice.amount}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Issued on <t:${Math.floor(new Date(invoice.issued_at).getTime() / 1000)}:F> by Prime Lobby Esports Automated Billing Engine.*`
      )
      .setFooter({ text: 'Thank you for your payment! Keep this invoice for your records.' })
      .setTimestamp();

    return { embeds: [embed] };
  },

  // Financial Stats Embed
  createStatsEmbed: (stats, guildName) => {
    const embed = new EmbedBuilder()
      .setColor('#7C4DFF')
      .setTitle(`📊 Payment & Revenue Overview — ${guildName}`)
      .setDescription(
        `**Financial Ledger Summary:**\n\n` +
        `💰 **Total Revenue Collected:** \`${stats.totalRevenue}\`\n` +
        `📈 **Total Transactions Recorded:** \`${stats.totalTransactions}\`\n` +
        `✅ **Approved & Verified:** \`${stats.approvedCount}\`\n` +
        `⏳ **Pending in Queue:** \`${stats.pendingCount}\`\n` +
        `❌ **Rejected / Invalid:** \`${stats.rejectedCount}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Authorized Accounts:**\n` +
        `• 🇮🇳 Domestic UPI: \`${DOMESTIC_UPI_ID}\`\n` +
        `• 🌐 International UPI: \`${INTERNATIONAL_UPI_ID}\``
      )
      .setFooter({ text: 'Prime Pay Financial Ledger' })
      .setTimestamp();

    return { embeds: [embed] };
  }
};

module.exports = paymentEmbeds;
