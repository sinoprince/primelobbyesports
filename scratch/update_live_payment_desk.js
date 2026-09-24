require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const paymentHandler = require('../src/handlers/paymentHandler');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
  try {
    const guild = client.guilds.cache.get('1543502896753287198');
    if (!guild) {
      console.log('Guild not found');
      process.exit(1);
    }
    console.log(`Updating payment desk for ${guild.name}...`);
    const res = await paymentHandler.updatePaymentDesk(guild);
    console.log('Result:', res);
  } catch (err) {
    console.error('Error updating payment desk:', err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
