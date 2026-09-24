const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  try {
    const guild = client.guilds.cache.get('1543502896753287198') || client.guilds.cache.first();
    console.log(`Connected to Guild: ${guild.name} (${guild.id})`);
    
    await guild.channels.fetch();
    const categories = guild.channels.cache.filter(c => c.type === 4); // GuildCategory
    
    console.log(`\n=== CATEGORIES & CHANNELS (${guild.channels.cache.size} total) ===`);
    for (const [catId, cat] of categories) {
      console.log(`\n📂 [CATEGORY] ${cat.name} (ID: ${catId})`);
      const children = guild.channels.cache.filter(c => c.parentId === catId);
      for (const [chId, ch] of children) {
        console.log(`   # ${ch.name} (type: ${ch.type})`);
      }
    }

    const uncategorized = guild.channels.cache.filter(c => !c.parentId && c.type !== 4);
    if (uncategorized.size > 0) {
      console.log(`\n📂 [UNCATEGORIZED]`);
      for (const [chId, ch] of uncategorized) {
        console.log(`   # ${ch.name} (type: ${ch.type})`);
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
