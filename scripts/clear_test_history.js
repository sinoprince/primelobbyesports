require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const storagePath = path.join(__dirname, '../data/storage.json');

// 1. Clean Database Storage
const raw = fs.readFileSync(storagePath, 'utf-8');
const data = JSON.parse(raw);

// Reset all history collections
data.tournaments = [];
data.tournament_participants = [];
data.scoreboard_entries = [];
data.payments = [];
data.invoices = [];
data.tickets = [];
data.counters = {
  tournament_id: 0,
  payment_id: 1000,
  invoice_id: 5000,
  ticket_numbers: {}
};

// Remove any test guilds
if (data.guild_settings && data.guild_settings['999888777666555444']) {
  delete data.guild_settings['999888777666555444'];
}

fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf-8');
console.log('✅ Local Database & History Reset to 0 (storage.json clean).');

// 2. Clear Discord Channels with Test History
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TARGET_CHANNEL_IDS = [
  '1552000659044438136', // 🛡️-payment-verification
  '1552000661695103096', // 🧾-payment-ledger-logs
  '1543513847556739082', // 🏆-active-tournaments
  '1552200707682340934', // 📊-tournaments-scoreboard
  '1552200610886058014', // 📊-efootball-scoreboard
  '1552200642397736963', // 📊-valorant-scoreboard
  '1552200665219076117', // 📊-freefire-scoreboard
  '1552200692439978076', // 📊-pubg-scoreboard
  '1552225388380291133', // 📝-efootball-registration
  '1552225428935024692', // 📝-valorant-registration
  '1552225463026319421', // 📝-freefire-registration
  '1552225498384302220', // 📝-pubg-registration
  '1552200604703785030', // 📢-efootball-announcements
  '1552200637142405231', // 📢-valorant-announcements
  '1552200660618055680', // 📢-freefire-announcements
  '1552200685624492063', // 📢-pubg-announcements
  '1552200705232732222', // 📢-tournaments-announcements
  '1543511477879574628'  // test
];

client.once('ready', async () => {
  console.log(`Connected as ${client.user.tag}. Purging test history from Discord channels...`);

  for (const chId of TARGET_CHANNEL_IDS) {
    try {
      const channel = await client.channels.fetch(chId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) continue;

      let fetched;
      do {
        fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (!fetched || fetched.size === 0) break;

        const deletable = fetched.filter(m => !m.pinned);
        if (deletable.size === 0) break;

        try {
          await channel.bulkDelete(deletable, true);
          console.log(`🧹 Bulk deleted ${deletable.size} messages in #${channel.name}`);
        } catch (e) {
          // If bulkDelete fails (messages older than 14 days), delete individually
          for (const msg of deletable.values()) {
            await msg.delete().catch(() => null);
          }
          console.log(`🧹 Deleted messages individually in #${channel.name}`);
        }
      } while (fetched && fetched.size >= 10);
    } catch (err) {
      console.warn(`Could not clear channel ${chId}:`, err.message);
    }
  }

  console.log('🎉 Discord channel history purged successfully!');
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
