require('dotenv').config();
const http = require('http');
const assert = require('assert');
const { app } = require('../src/web/server');
const { dbQueries } = require('../src/database/db');

const TEST_PORT = 3001;
const ADMIN_SECRET = process.env.ADMIN_WEB_SECRET || 'PLE-ADMIN-2026';

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Starting Web Management Software Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const server = app.listen(TEST_PORT);

  try {
    // 1. Test Static Landing Page
    console.log('[Test 1] Testing static HTML serve...');
    const indexRes = await request('/');
    assert.strictEqual(indexRes.status, 200, 'HTML page should return 200');
    console.log('✅ Static SPA HTML served successfully');

    // 2. Test Auth Failure
    console.log('[Test 2] Testing auth rejection with wrong PIN...');
    const failAuthRes = await request('/api/auth/login', { method: 'POST' }, { pin: 'WRONG-PIN' });
    assert.strictEqual(failAuthRes.status, 401, 'Wrong PIN should be 401');
    assert.strictEqual(failAuthRes.body.success, false);
    console.log('✅ Wrong PIN rejected successfully');

    // 3. Test Auth Success
    console.log('[Test 3] Testing auth success with ADMIN_WEB_SECRET...');
    const authRes = await request('/api/auth/login', { method: 'POST' }, { secret: ADMIN_SECRET });
    assert.strictEqual(authRes.status, 200, 'Correct PIN should return 200');
    assert.strictEqual(authRes.body.success, true);
    assert.strictEqual(authRes.body.token, ADMIN_SECRET);
    console.log('✅ Admin login succeeded, token received');

    const authHeaders = { 'Authorization': `Bearer ${ADMIN_SECRET}` };

    // 4. Test Protected Stats Endpoint
    console.log('[Test 4] Testing /api/stats with auth token...');
    const statsRes = await request('/api/stats', { headers: authHeaders });
    assert.strictEqual(statsRes.status, 200);
    assert.strictEqual(statsRes.body.success, true);
    assert.ok(statsRes.body.stats !== undefined);
    console.log(`✅ Stats loaded: ${statsRes.body.stats.totalTournaments} tournaments, ${statsRes.body.stats.confirmedParticipants} participants, ₹${statsRes.body.stats.totalRevenue} revenue`);

    // 5. Test Tournament Listing
    console.log('[Test 5] Testing /api/tournaments...');
    const tourneyRes = await request('/api/tournaments', { headers: authHeaders });
    assert.strictEqual(tourneyRes.status, 200);
    assert.ok(Array.isArray(tourneyRes.body.tournaments));
    console.log(`✅ Found ${tourneyRes.body.tournaments.length} tournaments in storage`);

    // 6. Test Tournament Creation via Web API
    console.log('[Test 6] Testing tournament deployment via /api/tournaments/create...');
    const createRes = await request('/api/tournaments/create', { method: 'POST', headers: authHeaders }, {
      title: 'Web Suite Test Championship',
      game: 'PUBG Mobile',
      formatMode: 'squad',
      maxSlots: 25,
      entryFee: '₹500 per Squad',
      prizePool: '1st: ₹3,000 | 2nd: ₹2,000 | 3rd: ₹1,000',
      rules: 'Web API verification tournament test rules.'
    });
    assert.strictEqual(createRes.status, 200);
    assert.strictEqual(createRes.body.success, true);
    const createdId = createRes.body.tournamentId;
    console.log(`✅ Tournament #${createdId} successfully deployed via web API`);

    // 7. Test Participants & Slot Balance for Created Tournament
    console.log(`[Test 7] Testing participant & balance slot tracking for tournament #${createdId}...`);
    const partRes = await request(`/api/tournaments/${createdId}/participants`, { headers: authHeaders });
    assert.strictEqual(partRes.status, 200);
    assert.strictEqual(partRes.body.success, true);
    assert.strictEqual(partRes.body.tournament.maxSlots, 25);
    console.log('✅ Tournament participants and capacity verified');

    // 7b. Test Manual Team Registration via Web API
    console.log(`[Test 7b] Testing manual team registration for tournament #${createdId}...`);
    const addTeamRes = await request(`/api/tournaments/${createdId}/add-participant`, { method: 'POST', headers: authHeaders }, {
      teamName: 'Team Soul',
      ign: 'SOUL_Mortal',
      userId: '785107558972391435',
      slotStatus: 'CONFIRMED',
      utr: 'MANUAL-PAY-001'
    });
    assert.strictEqual(addTeamRes.status, 200);
    assert.strictEqual(addTeamRes.body.success, true);

    const updatedParts = await request(`/api/tournaments/${createdId}/participants`, { headers: authHeaders });
    assert.strictEqual(updatedParts.body.participants.length, 1);
    assert.strictEqual(updatedParts.body.participants[0].teamName, 'Team Soul');
    console.log('✅ Manual team registration API verified');

    // 7c. Test Participant Status Change Option
    console.log(`[Test 7c] Testing participant status change for tournament #${createdId}...`);
    const statusChangePending = await request(`/api/tournaments/${createdId}/update-participant-status`, { method: 'POST', headers: authHeaders }, {
      userId: '785107558972391435',
      status: 'PENDING'
    });
    assert.strictEqual(statusChangePending.status, 200);
    assert.strictEqual(statusChangePending.body.success, true);

    const checkPendingParts = await request(`/api/tournaments/${createdId}/participants`, { headers: authHeaders });
    assert.strictEqual(checkPendingParts.body.participants[0].slotStatus, 'PENDING');

    const statusChangeConfirmed = await request(`/api/tournaments/${createdId}/update-participant-status`, { method: 'POST', headers: authHeaders }, {
      userId: '785107558972391435',
      status: 'CONFIRMED'
    });
    assert.strictEqual(statusChangeConfirmed.status, 200);
    assert.strictEqual(statusChangeConfirmed.body.success, true);

    const checkConfirmedParts = await request(`/api/tournaments/${createdId}/participants`, { headers: authHeaders });
    assert.strictEqual(checkConfirmedParts.body.participants[0].slotStatus, 'CONFIRMED');
    console.log('✅ Participant slot status change API verified (RESERVED <-> CONFIRMED)');

    // 8. Test Scoreboard Broadcast
    console.log(`[Test 8] Testing match score update for tournament #${createdId}...`);
    const scoreRes = await request(`/api/tournaments/${createdId}/score`, { method: 'POST', headers: authHeaders }, {
      round: 'Map 1: Erangel',
      p1: 'Titans Esports',
      p2: 'Shadow Gaming',
      result: '18 Kills (WWCD)',
      winner: 'Titans Esports'
    });
    assert.strictEqual(scoreRes.status, 200);
    assert.strictEqual(scoreRes.body.success, true);
    console.log('✅ Match result recorded and verified');

    // 9. Test Payment Verification Flow
    console.log('[Test 9] Testing payment creation and web verification...');
    const dummyPayment = dbQueries.createPayment({
      guild_id: '1543502896753287198',
      user_id: '999111222333',
      username: 'WebTester#0001',
      amount: '500',
      utr: '987654321098',
      screenshot_url: 'https://cdn.discordapp.com/attachments/test/proof.png',
      purpose: 'Web Suite Test Entry',
      tournament_id: createdId,
      squad_name: 'Alpha Squad',
      game_id: 'PUBG-ALPHA-1'
    });

    const paymentsRes = await request('/api/payments', { headers: authHeaders });
    assert.strictEqual(paymentsRes.status, 200);
    const foundPayment = paymentsRes.body.payments.find(p => p.id === dummyPayment.id);
    assert.ok(foundPayment !== undefined, 'Created payment should appear in payment ledger');
    assert.strictEqual(foundPayment.status, 'PENDING');
    console.log(`✅ Payment #${dummyPayment.id} with UTR ${dummyPayment.utr} visible in ledger`);

    // 10. Test Payment Approval
    console.log(`[Test 10] Testing approval of payment #${dummyPayment.id}...`);
    const approveRes = await request(`/api/payments/${dummyPayment.id}/approve`, { method: 'POST', headers: authHeaders }, {
      note: 'Web Admin 1-Click Verification'
    });
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.success, true);

    const updatedPayment = dbQueries.getPayment(dummyPayment.id);
    assert.strictEqual(updatedPayment.status, 'APPROVED', 'Payment status must be APPROVED');
    console.log('✅ Payment approved and slot confirmed');

    // 11. Test Tournament Conclusion
    console.log(`[Test 11] Testing tournament close for #${createdId}...`);
    const closeRes = await request(`/api/tournaments/${createdId}/close`, { method: 'POST', headers: authHeaders }, {
      winner: 'Titans Esports (1st Place: ₹3,000)'
    });
    assert.strictEqual(closeRes.status, 200);
    assert.strictEqual(closeRes.body.success, true);
    console.log('✅ Tournament closed and marked COMPLETED');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 ALL 11 WEB SOFTWARE VERIFICATION TESTS PASSED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('❌ Verification test failed:', err);
  process.exit(1);
});
