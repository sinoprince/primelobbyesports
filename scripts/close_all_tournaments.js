require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { dbQueries } = require('../src/database/db');
const tournamentHandler = require('../src/handlers/tournamentHandler');
const paymentHandler = require('../src/handlers/paymentHandler');

async function closeAllTournaments() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[Script] Logged in as ${client.user.tag}`);

  // Fetch all open tournaments
  const fs = require('fs');
  const path = require('path');
  const dbFile = path.join(__dirname, '../data/storage.json');
  const raw = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
  
  const openTourneys = raw.tournaments.filter(t => t.status === 'OPEN');
  console.log(`[Script] Found ${openTourneys.length} open tournament(s) across all guilds.`);

  for (const t of openTourneys) {
    console.log(`[Script] Closing tournament #${t.id} (${t.title}) in guild ${t.guild_id}...`);
    dbQueries.closeTournament(t.id, 'COMPLETED');

    try {
      // Refresh dashboard if message exists
      if (t.dashboard_channel_id && t.dashboard_message_id) {
        const channel = await client.channels.fetch(t.dashboard_channel_id).catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(t.dashboard_message_id).catch(() => null);
          if (msg) {
            const embedBuilder = require('../src/utils/embedBuilder');
            const updatedT = dbQueries.getTournament(t.id);
            const confirmed = dbQueries.getConfirmedParticipants(t.id);
            const payload = embedBuilder.createTournamentDashboardEmbed(updatedT, confirmed);
            await msg.edit(payload).catch(console.error);
            console.log(`[Script] Updated dashboard message for #${t.id}`);
          }
        }
      }

      // Send announcement in tournament announcements channel if available
      if (t.announcements_channel_id) {
        const annChan = await client.channels.fetch(t.announcements_channel_id).catch(() => null);
        if (annChan) {
          await annChan.send({
            content: `🏁 **TOURNAMENT CONCLUDED** 🏁\nTournament **#${t.id} (${t.title})** has been closed.`
          }).catch(() => null);
        }
      }
    } catch (err) {
      console.error(`[Script] Error updating Discord channels for tournament #${t.id}:`, err);
    }
  }

  // Update #💳-payment-desk for all cached guilds
  for (const [guildId, guild] of client.guilds.cache) {
    console.log(`[Script] Updating payment desk for guild: ${guild.name} (${guildId})`);
    await paymentHandler.updatePaymentDesk(guild).catch(console.error);
  }

  console.log('[Script] All running tournaments successfully closed and payment desk updated!');
  await client.destroy();
  process.exit(0);
}

closeAllTournaments().catch(err => {
  console.error('[Script] Fatal error:', err);
  process.exit(1);
});
