const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const paymentHandler = require('../../handlers/paymentHandler');
const paymentEmbeds = require('../../utils/paymentEmbeds');
const { dbQueries } = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('UPI Payment, QR Code billing, and invoice management')
    .addSubcommand(sub =>
      sub
        .setName('qrcode')
        .setDescription('Generate an instant scan-and-pay UPI QR code for a custom amount')
        .addNumberOption(opt =>
          opt
            .setName('amount')
            .setDescription('Amount in INR (e.g. 50, 100, 500)')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(opt =>
          opt
            .setName('gateway')
            .setDescription('Choose Domestic (HDFC) or International (SBI) account')
            .addChoices(
              { name: '🇮🇳 Domestic UPI (sinoprince366-1@okhdfcbank)', value: 'domestic' },
              { name: '🌐 International Receive UPI (sinoprince366-1@oksbi)', value: 'international' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('note')
            .setDescription('Payment note or tournament name')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('submit')
        .setDescription('Submit UPI transaction UTR / reference number and proof for verification')
        .addStringOption(opt =>
          opt
            .setName('utr')
            .setDescription('12-digit UPI Reference / UTR Number from your banking app')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt
            .setName('amount')
            .setDescription('Amount paid in INR (e.g. 50)')
            .setRequired(true)
        )
        .addAttachmentOption(opt =>
          opt
            .setName('screenshot')
            .setDescription('Payment screenshot image (JPG, PNG, JPEG, or WEBP format)')
        )
        .addStringOption(opt =>
          opt
            .setName('purpose')
            .setDescription('Purpose (e.g. Tournament Slot / Rank Role)')
        )
        .addIntegerOption(opt =>
          opt
            .setName('tournament_id')
            .setDescription('Tournament ID if paying for a tournament slot')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('View financial overview, revenue summary, and transaction counts')
    )
    .addSubcommand(sub =>
      sub
        .setName('invoice')
        .setDescription('Retrieve and display a digital invoice receipt')
        .addStringOption(opt =>
          opt
            .setName('id')
            .setDescription('Invoice ID (e.g. INV-5001)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('history')
        .setDescription('View your recent payment history and verification statuses')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild || interaction.client.guilds.cache.first();
    let member = interaction.member;
    if (!member && guild && guild.members && typeof guild.members.fetch === 'function') {
      member = await guild.members.fetch(interaction.user.id).catch(() => null);
    }
    if (!member) {
      member = {
        id: interaction.user.id,
        user: interaction.user,
        guild: guild
      };
    }

    if (subcommand === 'qrcode') {
      const amount = interaction.options.getNumber('amount');
      const note = interaction.options.getString('note') || 'Prime Lobby Esports Payment';
      const gateway = interaction.options.getString('gateway') || 'domestic';
      const isInternational = gateway === 'international';

      const payload = paymentEmbeds.createCustomQrEmbed(amount, note, interaction.user, isInternational);
      return interaction.reply({ ...payload, ephemeral: false });
    }

    if (subcommand === 'submit') {
      await interaction.deferReply({ ephemeral: true });

      const utr = interaction.options.getString('utr');
      const amount = interaction.options.getNumber('amount');
      const screenshot = interaction.options.getAttachment('screenshot');
      const purpose = interaction.options.getString('purpose') || 'Tournament Entry / Verification';
      const tournamentId = interaction.options.getInteger('tournament_id');

      if (screenshot) {
        const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const fileName = screenshot.name.toLowerCase();
        const isValid = validExtensions.some(ext => fileName.endsWith(ext)) || (screenshot.contentType && screenshot.contentType.startsWith('image/'));
        if (!isValid) {
          return interaction.editReply({
            content: '❌ Invalid file format! Please upload your payment screenshot in **JPG, PNG, JPEG, or WEBP** format.'
          });
        }
      }

      const screenshotUrl = screenshot ? screenshot.url : null;

      const res = await paymentHandler.submitPaymentProof(interaction.client, guild, member, {
        amount,
        utr,
        purpose,
        tournamentId,
        screenshotUrl
      });

      if (!res.success) {
        return interaction.editReply({ content: res.message });
      }

      return interaction.editReply({ content: res.message });
    }

    if (subcommand === 'stats') {
      const stats = dbQueries.getPaymentStats(guild.id);
      const payload = paymentEmbeds.createStatsEmbed(stats, guild.name);
      return interaction.reply({ ...payload, ephemeral: false });
    }

    if (subcommand === 'invoice') {
      const invoiceId = interaction.options.getString('id').toUpperCase();
      const invoice = dbQueries.getInvoice(invoiceId);

      if (!invoice) {
        return interaction.reply({ content: `❌ Invoice \`${invoiceId}\` was not found.`, ephemeral: true });
      }

      // Check access permission (owner or admin)
      const isOwner = invoice.user_id === member.id;
      const isAdmin = member.permissions.has('Administrator');
      if (!isOwner && !isAdmin) {
        return interaction.reply({ content: '🚫 You do not have permission to view this invoice.', ephemeral: true });
      }

      const payload = paymentEmbeds.createInvoiceEmbed(invoice);
      return interaction.reply({ ...payload, ephemeral: true });
    }

    if (subcommand === 'history') {
      const userPayments = dbQueries.getUserPayments(member.id);
      if (userPayments.length === 0) {
        return interaction.reply({
          content: 'ℹ️ You do not have any recorded payment submissions yet.',
          ephemeral: true
        });
      }

      const historyList = userPayments.slice(-8).reverse().map(p => {
        const statusEmoji = p.status === 'APPROVED' ? '✅' : p.status === 'REJECTED' ? '❌' : '⏳';
        return `• \`#${p.id}\` — **₹${p.amount}** (${p.purpose}) ➔ ${statusEmoji} \`${p.status}\` (UTR: \`${p.utr}\`)`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#00E676')
        .setTitle(`📜 Payment History for ${member.user.tag}`)
        .setDescription(`**Your recent payment submissions:**\n\n${historyList}`)
        .setFooter({ text: 'Prime Pay Ledger' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
