require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

const token = process.env.PAYMENT_BOT_TOKEN || process.env.DISCORD_TOKEN;
const clientId = process.env.PAYMENT_CLIENT_ID || process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User]
});

client.commands = new Collection();

// Load Payment Commands
const commandsPath = path.join(__dirname, '../../src/commands/payments');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`[PaymentBot] Loaded command /${command.data.name}`);
    }
  }
}

async function registerCommands() {
  if (!clientId || !token) return;
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [] }
      );
      console.log(`[PaymentBot] Cleared all guild slash commands for Guild ID: ${guildId} (100% Web Software Mode)`);
    }
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );
    console.log('[PaymentBot] Cleared all global slash commands (100% Web Software Mode)');
  } catch (err) {
    console.warn('[PaymentBot] Note on clearing commands:', err.message);
  }
}

client.once('ready', async () => {
  console.log(`[PaymentBot] Logged in as ${client.user.tag} (${client.user.id})`);
  await registerCommands();

  // Auto-refresh Payment Desk in #💳-payment-desk as Payment Bot
  const targetGuild = (guildId ? client.guilds.cache.get(guildId) : null) || client.guilds.cache.first();
  if (targetGuild) {
    try {
      const paymentHandler = require('../../src/handlers/paymentHandler');
      await paymentHandler.updatePaymentDesk(targetGuild);
      console.log('[PaymentBot] Payment Desk verified & updated in #💳-payment-desk');
    } catch (err) {
      console.error('[PaymentBot] Error updating payment desk on startup:', err.message);
    }
  }
});

client.on('guildCreate', async (guild) => {
  console.log(`[PaymentBot] Joined new server: ${guild.name} (${guild.id})`);
  await registerCommands();
});

// Forward interaction handling
const interactionHandler = require('../../src/events/interactionCreate');
client.on('interactionCreate', (interaction) => interactionHandler.execute(interaction, client));

// Forward message handling (for direct screenshot proof in DMs)
const messageHandler = require('../../src/events/messageCreate');
client.on('messageCreate', (message) => messageHandler.execute(message, client));

// Error handling
process.on('unhandledRejection', (reason) => {
  console.error('[PaymentBot] Unhandled Rejection:', reason);
});

client.login(token).catch(err => {
  console.error('[PaymentBot] Failed to log in:', err.message);
});

module.exports = client;
