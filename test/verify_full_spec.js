const assert = require('assert');
const securityHandler = require('../src/handlers/securityHandler');
const paymentEmbeds = require('../src/utils/paymentEmbeds');
const { dbQueries } = require('../src/database/db');

console.log('--- STARTING SPECIFICATION INTEGRATION TESTS ---');

// 1. Test Automated Security Handler
console.log('1. Testing Security Handler (Anti-Scam & Anti-Spam)...');
let deletedCount = 0;
let timeoutApplied = false;

const mockScamMessage = {
  guild: { name: 'Test Guild', id: '123' },
  author: { id: 'user_scammer_1', bot: false, tag: 'Scammer#0001', send: async () => true },
  member: {
    moderatable: true,
    permissions: { has: () => false },
    roles: { cache: new Map() },
    timeout: async () => { timeoutApplied = true; }
  },
  channel: { id: 'chan_1', send: async () => true },
  content: 'Hey guys free nitro here: https://discorcl.gift/nitro-drop-free',
  delete: async () => { deletedCount++; }
};

(async () => {
  const isMalicious = await securityHandler.handleMessage(mockScamMessage);
  assert.strictEqual(isMalicious, true, 'Scam link should be detected as malicious');
  assert.strictEqual(deletedCount, 1, 'Scam message should be deleted');
  assert.strictEqual(timeoutApplied, true, 'Scammer account should receive a timeout');
  console.log('✔ Anti-phishing & scam link neutralization verified.');

  // Test Invite Link Filter for unverified members
  deletedCount = 0;
  const mockInviteMessage = {
    guild: { name: 'Test Guild', id: '123' },
    author: { id: 'user_spammer_2', bot: false, tag: 'Spammer#0002', send: async () => true },
    member: {
      moderatable: true,
      permissions: { has: () => false },
      roles: { cache: new Map() } // No Member role
    },
    channel: { id: 'chan_1', send: async () => true },
    content: 'Join my new clan server https://discord.gg/invite1234',
    delete: async () => { deletedCount++; }
  };
  const isInviteBlocked = await securityHandler.handleMessage(mockInviteMessage);
  assert.strictEqual(isInviteBlocked, true, 'Unauthorized invite should be blocked');
  assert.strictEqual(deletedCount, 1, 'Invite message should be deleted');
  console.log('✔ Unauthorized invite protection verified.');

  // 2. Test Assisted Registration Embeds & Gateways
  console.log('2. Testing Payment-Assisted Registration DM Payloads...');
  const mockTourney = {
    id: 99,
    title: 'eFootball ₹1,500 Instant Cash Cup',
    game: 'eFootball',
    entry_fee: '₹300',
    prize_pool: '₹1,500 Instant Cash',
    max_participants: 8
  };
  const mockUser = { id: 'user_player_1', tag: 'Player#1111' };
  const dmPayload = paymentEmbeds.createTournamentAssistedDmPayload(
    mockTourney,
    mockUser,
    { ingame_id: 'eFootUID:987654321', squad_name: 'Titans Esports' }
  );

  assert.ok(dmPayload.embeds && dmPayload.embeds.length > 0, 'DM payload must have embeds');
  assert.ok(dmPayload.components && dmPayload.components.length > 0, 'DM payload must have action buttons');
  const buttons = dmPayload.components[0].components;
  assert.strictEqual(buttons.length, 3, 'Must have Domestic, International, and Submit Proof buttons');
  assert.ok(buttons[0].data.custom_id.includes('dom'), 'First button is domestic gateway');
  assert.ok(buttons[1].data.custom_id.includes('intl'), 'Second button is international gateway');
  console.log('✔ Payment-assisted registration DM payload verified.');

  // 3. Test Database Participant with Squad Name & Game ID
  console.log('3. Testing Tournament Participant & Payment DB Integration...');
  const testTourneyId = 999;
  dbQueries.addParticipant(
    testTourneyId,
    'user_tester_99',
    'Tester#9999',
    'UID:999888',
    'PENDING',
    'None',
    'Apex Predators'
  );

  const pendingParts = dbQueries.getPendingParticipants(testTourneyId);
  const foundPart = pendingParts.find(p => p.user_id === 'user_tester_99');
  assert.ok(foundPart, 'Participant should be found in pending list');
  assert.strictEqual(foundPart.squad_name, 'Apex Predators', 'Squad name must match');
  assert.strictEqual(foundPart.ingame_id, 'UID:999888', 'In-game ID must match');
  console.log('✔ Tournament participant squad name & in-game ID stored cleanly.');

  // 4. Test Payment Record with Gateway & Squad
  const testPayment = dbQueries.createPayment({
    guild_id: '1543502896753287198',
    user_id: 'user_tester_99',
    username: 'Tester#9999',
    amount: '300',
    utr: '998877665544',
    screenshot_url: 'https://example.com/screenshot.png',
    purpose: 'Tournament #999 Entry',
    tournament_id: testTourneyId,
    game_id: 'UID:999888',
    squad_name: 'Apex Predators',
    gateway_type: 'DOMESTIC'
  });

  assert.strictEqual(testPayment.amount, '300');
  assert.strictEqual(testPayment.squad_name, 'Apex Predators');
  assert.strictEqual(testPayment.game_id, 'UID:999888');

  // Verify Admin Payment Verification Alert Embed
  const adminAlert = paymentEmbeds.createAdminPaymentAlertEmbed(testPayment);
  assert.ok(adminAlert.embeds[0].data.description.includes('Apex Predators'), 'Alert must display squad name');
  assert.ok(adminAlert.embeds[0].data.description.includes('UID:999888'), 'Alert must display in-game ID');
  console.log('✔ Admin verification alert embed renders squad name & in-game ID.');

  // Clean up test data
  dbQueries.removeParticipant(testTourneyId, 'user_tester_99');

  console.log('\n======================================================');
  console.log('🎉 ALL SYSTEM SPECIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================\n');
})();
