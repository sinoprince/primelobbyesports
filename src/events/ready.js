const { REST, Routes, ActivityType } = require('discord.js');
const gameRoleHandler = require('../handlers/gameRoleHandler');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[Bot] Logged in as ${client.user.tag} (${client.user.id})`);

    // Set custom activity status
    client.user.setPresence({
      activities: [{ name: '🏆 Tournaments & 🎫 Support', type: ActivityType.Watching }],
      status: 'online'
    });

    // Clear and remove all slash commands from Discord (Everything is now managed via Website)
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
      if (process.env.GUILD_ID) {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
          { body: [] }
        );
        console.log(`[SlashCommands] Cleared all guild slash commands for Guild ID: ${process.env.GUILD_ID} (100% Web Software Mode)`);
      }
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: [] }
      );
      console.log('[SlashCommands] Cleared all global slash commands (100% Web Software Mode)');
    } catch (error) {
      console.warn('[SlashCommands] Note on clearing commands:', error.message);
    }

    // Automatically verify game hubs, registration channels, and pick-your-games panel
    for (const guild of client.guilds.cache.values()) {
      await gameRoleHandler.setupGameHubs(guild).catch(err => {
        console.error(`[Ready] Error ensuring game hubs for ${guild.name}:`, err.message);
      });
      await gameRoleHandler.ensurePickYourGamesPanel(guild).catch(err => {
        console.error(`[Ready] Error ensuring pick-your-games for ${guild.name}:`, err.message);
      });
    }

    // Schedule background check for closed tournaments:
    // - Purges messages 24 hours after tournament close (retaining scoreboard)
    // - Cleans up scoreboard 48 hours after tournament close
    const tournamentHandler = require('../handlers/tournamentHandler');
    tournamentHandler.processClosedTournamentsCleanup(client).catch(() => null);
    setInterval(() => {
      tournamentHandler.processClosedTournamentsCleanup(client).catch(err => {
        console.warn('[AutoCleanup] Error in periodic cleanup cycle:', err.message);
      });
    }, 15 * 60 * 1000); // Check every 15 minutes
  }
};
