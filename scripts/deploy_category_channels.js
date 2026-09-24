const { Client, GatewayIntentBits } = require('discord.js');
const gameRoleHandler = require('../src/handlers/gameRoleHandler');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', async () => {
  try {
    const guild = client.guilds.cache.get('1543502896753287198') || client.guilds.cache.first();
    console.log(`[Deploy] Connected to guild: ${guild.name} (${guild.id})`);

    await guild.channels.fetch();
    await guild.roles.fetch();

    console.log('[Deploy] Deploying tournament announcement and scoreboard channels to all categories...');
    const result = await gameRoleHandler.setupGameHubs(guild);

    if (result.success) {
      console.log(`[Deploy] Successfully deployed categories! Total categories processed: ${result.categories.length}`);
      console.log(`[Deploy] Channels created/updated: ${result.channels.length}`);
    } else {
      console.error('[Deploy] Setup returned error:', result.error);
    }

    // Verify all categories and their announcement/scoreboard channels
    await guild.channels.fetch();
    console.log('\n=== CURRENT VERIFIED CATEGORIES & CHANNELS ===');
    const categories = guild.channels.cache.filter(c => c.type === 4);
    for (const [catId, cat] of categories) {
      console.log(`\n📂 [CATEGORY] ${cat.name}`);
      const children = guild.channels.cache.filter(c => c.parentId === catId);
      for (const [chId, ch] of children) {
        console.log(`   # ${ch.name} (type: ${ch.type})`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('[Deploy] Fatal error during deployment:', err);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
