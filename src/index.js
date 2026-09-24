require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const paymentBotService = require('./utils/paymentBotService');

// Initialize Dedicated Payment Bot Client for DM operations
if (process.env.PAYMENT_BOT_TOKEN) {
  paymentBotService.init();
}

// Validate Token Presence
if (!process.env.DISCORD_TOKEN) {
  console.warn('\n⚠️ [WARNING] DISCORD_TOKEN is missing in your .env file!');
  console.warn('Please fill in your bot token in .env and restart the bot.\n');
}

// Initialize Discord Client with all required Gateway Intents and Partials
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,            // Required for Visitor / Member role assignment
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,          // Required for DM proof submissions
    GatewayIntentBits.DirectMessageReactions,  // Required for DM interactions
    GatewayIntentBits.MessageContent,          // Required for reading message interactions & screenshots
    GatewayIntentBits.GuildMessageReactions,   // Required for reaction verification & tickets
    GatewayIntentBits.GuildVoiceStates         // Required for Support Voice auto-mute
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember
  ]
});

client.commands = new Collection();

// Load Commands Recursively
function loadCommands(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    // If dedicated Payment Bot is active, Main Bot only handles community, tournaments, tickets, and setup
    if (file.isDirectory() && file.name === 'payments' && process.env.PAYMENT_BOT_TOKEN) {
      continue;
    }
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      loadCommands(fullPath);
    } else if (file.name.endsWith('.js')) {
      try {
        const command = require(fullPath);
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
          console.log(`[CommandLoader] Loaded /${command.data.name} from ${path.relative(__dirname, fullPath)}`);
        }
      } catch (err) {
        console.error(`[CommandLoader] Error loading command ${file.name}:`, err);
      }
    }
  }
}

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  loadCommands(commandsPath);
}

// Load Events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const event = require(filePath);
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      console.log(`[EventLoader] Registered event: ${event.name}`);
    } catch (err) {
      console.error(`[EventLoader] Error loading event ${file}:`, err);
    }
  }
}

// Global Exception & Rejection Handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[AntiCrash] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error(`[AntiCrash] Uncaught Exception: ${err.message}`, origin);
});

// Login to Discord if token is provided
if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'your_bot_token_here') {
  client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('[BotLogin] Login failed:', err.message);
  });
} else {
  console.log('📌 Bot started in configuration mode. Once you provide your DISCORD_TOKEN in .env, run "npm start" to connect!');
}

module.exports = client;
