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
    const member = await guild.members.fetch('930810281972629596').catch(() => null);
    console.log('Found member:', member ? member.user.tag : 'null');
    
    console.log('Testing submitPaymentProof with test data...');
    const res = await paymentHandler.submitPaymentProof(client, guild, member || { id: '930810281972629596', user: { id: '930810281972629596', username: 'testuser' } }, {
      amount: 300,
      utr: '123456789012',
      purpose: 'eFootball Tournament Entry',
      screenshotUrl: 'https://example.com/test.jpg'
    });
    console.log('Result:', res);
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
