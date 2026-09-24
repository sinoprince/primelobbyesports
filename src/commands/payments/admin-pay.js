const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const paymentHandler = require('../../handlers/paymentHandler');
const paymentEmbeds = require('../../utils/paymentEmbeds');
const { dbQueries } = require('../../database/db');
const config = require('../../../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay-admin')
    .setDescription('Admin controls for payments, ledger, and approval management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Builds the 💳 PAYMENTS & BILLING category and control channels')
    )
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Deploys the interactive Payment & Verification Desk embed in a channel')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel to post the payment desk in (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('desk-update')
        .setDescription('Refreshes the official #💳-payment-desk with latest tournament availability')
    )
    .addSubcommand(sub =>
      sub
        .setName('approve')
        .setDescription('Approve a pending payment and issue a digital invoice to the player')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('Payment ID (e.g. 1001)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('note')
            .setDescription('Optional admin note to include on the invoice')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reject')
        .setDescription('Reject a payment and notify the player')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('Payment ID (e.g. 1001)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('Reason for rejection (e.g. Invalid UTR / Incorrect Amount)')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('ledger')
        .setDescription('View recent transactions, approvals, and revenue entries')
        .addIntegerOption(opt =>
          opt
            .setName('limit')
            .setDescription('Number of transactions to show (default: 10)')
            .setMinValue(1)
            .setMaxValue(25)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member;

    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.some(r => r.name.toLowerCase() === config.roles.admin.toLowerCase() || r.name.toLowerCase() === config.roles.staff.toLowerCase());

    if (!isAdmin) {
      return interaction.reply({
        content: '🚫 Only Admins and Financial Staff can access `/pay-admin` commands.',
        ephemeral: true
      });
    }

    if (subcommand === 'setup') {
      await interaction.deferReply({ ephemeral: true });
      const res = await paymentHandler.setupPaymentCategory(guild);
      if (!res.success) {
        return interaction.editReply({ content: `❌ Failed to setup payment category: ${res.error}` });
      }

      return interaction.editReply({
        content: `🎉 **Payment & Verification Setup Complete!**\n\n` +
          `📁 **💳 PAYMENTS (Public)**\n` +
          `• <#${res.paymentDesk.id}> — Public Scan-to-Pay Desk & Proof Submissions (JPG/PNG)\n\n` +
          `📁 **🛡️ ADMIN CATEGORY (Private)**\n` +
          `• <#${res.adminControlChannel.id}> — **One Verification Channel** for Screenshot Approvals\n` +
          `• <#${res.ledgerChannel.id}> — Digital Invoices & Revenue Ledger`
      });
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const activeTourneys = dbQueries.getActiveTournaments(guild.id).filter(t => t.status === 'OPEN');
      const enrichedTourneys = activeTourneys.map(t => ({
        ...t,
        participant_count: dbQueries.getParticipantCount(t.id)
      }));
      const payload = paymentEmbeds.createPaymentDeskEmbed(enrichedTourneys);
      await channel.send(payload);

      return interaction.reply({
        content: `✅ **Payment Desk deployed** successfully in <#${channel.id}>!`,
        ephemeral: true
      });
    }

    if (subcommand === 'desk-update') {
      await interaction.deferReply({ ephemeral: true });
      const res = await paymentHandler.updatePaymentDesk(guild);
      if (!res.success) {
        return interaction.editReply({ content: `❌ Failed to update payment desk: ${res.message}` });
      }
      return interaction.editReply({ content: '✅ **Payment Desk updated successfully** in `#💳-payment-desk` with current tournament status!' });
    }

    if (subcommand === 'approve') {
      await interaction.deferReply({ ephemeral: true });
      const paymentId = interaction.options.getInteger('id');
      const note = interaction.options.getString('note') || '';

      const res = await paymentHandler.approvePayment(interaction.client, paymentId, member, note);
      if (!res.success) {
        return interaction.editReply({ content: `❌ ${res.message}` });
      }

      return interaction.editReply({ content: res.message });
    }

    if (subcommand === 'reject') {
      await interaction.deferReply({ ephemeral: true });
      const paymentId = interaction.options.getInteger('id');
      const reason = interaction.options.getString('reason') || 'Invalid transaction reference or unverified funds';

      const res = await paymentHandler.rejectPayment(interaction.client, paymentId, member, reason);
      if (!res.success) {
        return interaction.editReply({ content: `❌ ${res.message}` });
      }

      return interaction.editReply({ content: res.message });
    }

    if (subcommand === 'ledger') {
      const limit = interaction.options.getInteger('limit') || 10;
      const allPayments = dbQueries.getAllPayments(guild.id);

      if (allPayments.length === 0) {
        return interaction.reply({
          content: 'ℹ️ No transactions have been recorded in the ledger yet.',
          ephemeral: true
        });
      }

      const recent = allPayments.slice(-limit).reverse();
      const rows = recent.map(p => {
        const badge = p.status === 'APPROVED' ? '🟢 APPROVED' : p.status === 'REJECTED' ? '🔴 REJECTED' : '🟡 PENDING';
        return `\`#${p.id}\` | **₹${p.amount}** | <@${p.user_id}> | \`${badge}\` | UTR: \`${p.utr}\``;
      }).join('\n');

      const stats = dbQueries.getPaymentStats(guild.id);

      const embed = new EmbedBuilder()
        .setColor('#6200EA')
        .setTitle(`📖 Financial Transaction Ledger (${recent.length} recent)`)
        .setDescription(
          `**Total Revenue:** \`${stats.totalRevenue}\` | **Total Records:** \`${stats.totalTransactions}\`\n\n` +
          `${rows}\n\n` +
          `*Use \`/pay-admin approve <id>\` or \`/pay-admin reject <id>\` to manage pending transactions.*`
        )
        .setFooter({ text: 'Prime Lobby Esports Financial Accounting' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
