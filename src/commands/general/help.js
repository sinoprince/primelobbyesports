const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Displays bot features, commands, and setup instructions'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🤖 Community & Tournament Bot Guide')
      .setDescription(
        `This server is powered by two specialized bots:\n` +
        `• **Prime Lobby eSports:** Main community, tournaments, announcements & automated security sentinel.\n` +
        `• **PLE Payments Bot:** Automated payment billing, QR delivery, verification & digital receipts.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 1. 🛡️ Role & Access Verification\n` +
        `• **New Joins:** Automatically assigned the \`Visitor\` role.\n` +
        `• **Verification:** Accept rules in \`#verification\` to unlock \`Member\` privileges.\n\n` +
        `### 2. 🛡️ Automated Scam & Spam Protection\n` +
        `• **Anti-Phishing Filter:** Auto-deletes scam nitro, steam links, and token loggers.\n` +
        `• **Anti-Flood Rate Limiting:** Automatically blocks rapid message flooding and spambots.\n` +
        `• **Invite Protection:** Restricts unverified external Discord invites.\n\n` +
        `### 3. 📢 Server & Tournament Announcements\n` +
        `• \`/announce\` - Post branded community and tournament announcements.\n\n` +
        `### 4. 🏆 Tournament Hosting & Live Scoreboard\n` +
        `• \`/tournament host-efootball\` - Host 8-player eFootball Cup (₹250 fee, ₹1,500 prize).\n` +
        `• \`/tournament create\` - Custom tournament setup with automated channels & bracket.\n` +
        `• \`/tournament scoreboard\` - Update match scores and broadcast winners live.\n` +
        `• \`/tournament scoreboard-view\` - View the active 8-player bracket in \`#📊-scoreboard\`.\n\n` +
        `### 5. 💳 Assisted Payment Registration & Tickets\n` +
        `• Click **Register** on any tournament announcement to submit In-Game ID & Squad Name.\n` +
        `• The Payment Bot DMs you private Domestic / International QR codes.\n` +
        `• Upload screenshot in DM to verify your slot in \`#🛡️-payment-verification\`.\n` +
        `• Rejected submissions provide an instant button to open an appeal ticket in \`#🎫-tickets\`.\n\n` +
        `### ⚙️ Quick Admin Setup Commands\n` +
        `• \`/setup all\` - Complete server initialization.\n` +
        `• \`/pay-admin setup-category\` - Setup dedicated payment desk & verification channel.`
      )
      .setFooter({ text: 'Prime Lobby Esports Operations Suite' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
