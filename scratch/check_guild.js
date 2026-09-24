require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

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
    console.log(`Guild found: ${guild.name} (${guild.id})`);
    console.log('--- CHANNELS ---');
    guild.channels.cache.forEach(c => {
      console.log(`[${c.type}] ${c.name} (${c.id}) - parent: ${c.parentId}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
