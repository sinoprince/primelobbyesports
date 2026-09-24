const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Get direct web link & credentials for the Tournament Management Software')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const port = process.env.WEB_PORT || 3000;
    const secret = process.env.ADMIN_WEB_SECRET || 'PLE-ADMIN-2026';
    const webUrl = `http://localhost:${port}`;

    const embed = new EmbedBuilder()
      .setColor('#00d2ff')
      .setTitle('🛡️ PRIME LOBBY ESPORTS — TOURNAMENT MANAGEMENT SOFTWARE')
      .setDescription(
        'Welcome Admin! You can access the unified web control panel to manage tournaments, monitor live team slots, approve/reject payment UTR proofs, and broadcast match results directly to Discord.'
      )
      .addFields(
        {
          name: '🌐 Web Dashboard URL',
          value: `[**Launch Tournament Management Software**](${webUrl})\n\`${webUrl}\``,
          inline: false
        },
        {
          name: '🔑 Admin Secret PIN',
          value: `||\`${secret}\`|| *(Click to reveal secret)*`,
          inline: true
        },
        {
          name: '⚡ Live Features',
          value: '• 1-Click Tournament Deployment\n• Real-Time Slot Balance & Teams\n• Instant Payment Proof Ledger\n• Match Scoreboard Broadcaster\n• Support Tickets Monitor',
          inline: false
        }
      )
      .setFooter({
        text: 'Prime Lobby Esports Management Suite • Keep PIN confidential',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Management Software')
        .setStyle(ButtonStyle.Link)
        .setURL(webUrl)
        .setEmoji('🖥️')
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }
};
