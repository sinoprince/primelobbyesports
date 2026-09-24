// Test script to verify database operations, command structures, and embed generation
const assert = require('assert');
const { dbQueries } = require('../src/database/db');
const embedBuilder = require('../src/utils/embedBuilder');
const config = require('../config.json');

console.log('--- STARTING BOT VERIFICATION TESTS ---');

// 1. Test Database Operations
console.log('1. Testing Database CRUD...');

// Guild Settings test
const testGuildId = '999888777666555444';
dbQueries.updateGuildSettings(testGuildId, {
  visitor_role_id: '111111111111111111',
  member_role_id: '222222222222222222',
  rules_channel_id: '333333333333333333',
  support_voice_id: '444444444444444444'
});

const settings = dbQueries.getGuildSettings(testGuildId);
assert.strictEqual(settings.visitor_role_id, '111111111111111111');
assert.strictEqual(settings.member_role_id, '222222222222222222');
console.log('✔ Guild Settings test passed.');

// Tournament test
const tourneyId = dbQueries.createTournament({
  guild_id: testGuildId,
  title: 'Championship Test Cup',
  game: 'eFootball',
  max_participants: 16,
  entry_fee: '₹50 (GPay)',
  prize_pool: '1st: ₹500 | 2nd: ₹250',
  gpay_info: 'UPI: gamer@okhdfcbank',
  rules_text: '10 min matches',
  created_by: '555555555555555555'
});

const tourney = dbQueries.getTournament(tourneyId);
assert(tourney !== null);
assert.strictEqual(tourney.title, 'Championship Test Cup');
assert.strictEqual(tourney.max_participants, 16);
console.log(`✔ Tournament creation test passed (ID: #${tourneyId}).`);

// Participant test
dbQueries.addParticipant(tourneyId, '123456789012345678', 'TestPlayer1', 'IGN#9999', 'CONFIRMED');
assert.strictEqual(dbQueries.isParticipant(tourneyId, '123456789012345678'), true);
assert.strictEqual(dbQueries.getParticipantCount(tourneyId), 1);
const participants = dbQueries.getParticipants(tourneyId);
assert.strictEqual(participants.length, 1);
assert.strictEqual(participants[0].username, 'TestPlayer1');
console.log('✔ Tournament Participant test passed.');

// Ticket test
const testChannelId = `channel-test-${Date.now()}`;
const ticketRes = dbQueries.createTicket(testGuildId, '123456789012345678', 'TestPlayer1', testChannelId, 'Tournament & Payment Support');
assert(ticketRes.ticketNumber >= 1);
const ticket = dbQueries.getTicketByChannel(testChannelId);
assert(ticket !== null);
assert.strictEqual(ticket.status, 'OPEN');

dbQueries.claimTicket(testChannelId, 'staff-111');
const claimedTicket = dbQueries.getTicketByChannel(testChannelId);
assert.strictEqual(claimedTicket.status, 'CLAIMED');

dbQueries.closeTicket(testChannelId);
const closedTicket = dbQueries.getTicketByChannel(testChannelId);
assert.strictEqual(closedTicket.status, 'CLOSED');
console.log('✔ Ticket system DB lifecycle test passed.');

// 2. Test Embed Builder
console.log('2. Testing Embed Builder...');
const rulesEmbed = embedBuilder.createRulesEmbed('Test Esports Arena');
assert(rulesEmbed.embeds.length > 0);
assert(rulesEmbed.components.length > 0);

const tourneyEmbed = embedBuilder.createTournamentDashboardEmbed(tourney, participants);
assert(tourneyEmbed.embeds.length > 0);
assert(tourneyEmbed.components.length > 0);

const ticketDeskEmbed = embedBuilder.createTicketPanelEmbed();
assert(ticketDeskEmbed.embeds.length > 0);
assert(ticketDeskEmbed.components.length > 0);
console.log('✔ Embed Builder tests passed.');

// 3. Test Command Definitions
console.log('3. Testing Command Definitions...');
const setupCmd = require('../src/commands/admin/setup');
const tourneyCmd = require('../src/commands/tournament/tournament');
const ticketCmd = require('../src/commands/tickets/ticket');
const helpCmd = require('../src/commands/general/help');

assert(setupCmd.data && typeof setupCmd.execute === 'function');
assert(tourneyCmd.data && typeof tourneyCmd.execute === 'function');
assert(ticketCmd.data && typeof ticketCmd.execute === 'function');
assert(helpCmd.data && typeof helpCmd.execute === 'function');
console.log('✔ All Slash Command schemas and handlers verified.');

// 4. Test Event Handlers
console.log('4. Testing Event Handlers...');
const readyEvent = require('../src/events/ready');
const memberAddEvent = require('../src/events/guildMemberAdd');
const interactionEvent = require('../src/events/interactionCreate');
const reactionEvent = require('../src/events/messageReactionAdd');
const voiceEvent = require('../src/events/voiceStateUpdate');

assert(readyEvent.name === 'ready');
assert(memberAddEvent.name === 'guildMemberAdd');
assert(interactionEvent.name === 'interactionCreate');
assert(reactionEvent.name === 'messageReactionAdd');
assert(voiceEvent.name === 'voiceStateUpdate');
console.log('✔ All Event listeners verified.');

console.log('\n========================================');
console.log('🎉 ALL BOT SYSTEM TESTS PASSED CLEANLY! 🎉');
console.log('========================================\n');
