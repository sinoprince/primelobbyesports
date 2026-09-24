require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const paymentEmbeds = require('../src/utils/paymentEmbeds');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
  try {
    const channel = await client.channels.fetch('1552000650798301334').catch(() => null);
    if (!channel) {
      console.log('Payment desk channel not found');
      process.exit(1);
    }
    console.log(`Found channel: #${channel.name}`);
    const msgs = await channel.messages.fetch({ limit: 10 });
    console.log(`Fetched ${msgs.size} messages`);
    msgs.forEach(m => console.log(`Msg ${m.id} by ${m.author.tag}`));
  } catch (err) {
    console.error(err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
