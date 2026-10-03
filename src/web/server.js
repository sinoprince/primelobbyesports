require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const botBridge = require('./botBridge');
const { dbQueries } = require('../database/db');

const app = express();
const PORT = process.env.PORT || process.env.WEB_PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_WEB_SECRET || 'PLE-ADMIN-2026';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Admin-Only Auth Helpers
function getAuthInfo(req) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-key'] || req.query.key;
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // Strictly Master Admin Token
  if (token === ADMIN_SECRET) {
    return { role: 'admin', name: 'Master Administrator' };
  }

  return null;
}

// Simple Auth Middleware for Admin Only
function checkAdminAuth(req, res, next) {
  const auth = getAuthInfo(req);
  if (!auth) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please enter Admin PIN.' });
  }
  req.user = auth;
  next();
}

// Middleware allowing Admin
function checkAnyAuth(req, res, next) {
  return checkAdminAuth(req, res, next);
}

// 0. Lightweight Health Check Endpoints (for UptimeRobot / Cron pings)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// 1. Auth Endpoint (Admin-Only Login)
app.post('/api/auth/login', (req, res) => {
  const pin = req.body.pin || req.body.secret || req.body.password;

  if (pin && pin.trim() === ADMIN_SECRET) {
    return res.json({ 
      success: true, 
      token: ADMIN_SECRET, 
      role: 'admin', 
      name: 'Tournament Director',
      message: 'Admin authentication verified.' 
    });
  }
  return res.status(401).json({ success: false, message: 'Invalid Admin Access Key.' });
});

// Verification screenshot upload endpoint
app.post('/api/upload/screenshot', checkAdminAuth, (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'Image data is required' });
    }

    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let ext = '.png';

    if (matches && matches.length === 3) {
      buffer = Buffer.from(matches[2], 'base64');
      if (matches[1].includes('jpeg') || matches[1].includes('jpg')) ext = '.jpg';
      else if (matches[1].includes('webp')) ext = '.webp';
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    const safeName = `proof_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);
    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      url: `/uploads/${safeName}`,
      message: 'Screenshot uploaded successfully'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Overview Stats Endpoint
app.get('/api/stats', checkAdminAuth, (req, res) => {
  try {
    const stats = botBridge.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Channels Selector Endpoint
app.get('/api/channels', checkAdminAuth, async (req, res) => {
  try {
    const channels = await botBridge.getChannels();
    res.json({ success: true, channels });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Tournaments Endpoints
app.get('/api/tournaments', checkAdminAuth, (req, res) => {
  try {
    const storage = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/storage.json'), 'utf-8'));
    const tournaments = (storage.tournaments || []).map(t => {
      const participants = (storage.tournament_participants || []).filter(p => p.tournament_id === t.id);
      const confirmed = participants.filter(p => p.payment_status === 'CONFIRMED');
      const pending = participants.filter(p => p.payment_status === 'PENDING');
      const balanceSlots = Math.max(0, (t.max_participants || t.maxSlots || 25) - confirmed.length);

      return {
        ...t,
        title: t.name || t.title,
        maxSlots: t.max_participants || t.maxSlots,
        entryFee: t.entry_fee || t.entryFee,
        prizePool: t.prize_pool || t.prizePool,
        formatMode: t.mode || t.formatMode,
        channelId: t.dashboard_channel_id || t.channelId,
        participants: participants.map(p => ({
          ...p,
          userId: p.user_id,
          teamName: p.team_name || p.squad_name || 'Solo',
          ign: p.in_game_id || p.ingame_id || p.ign || 'N/A',
          slotStatus: p.payment_status,
          paid: p.payment_status === 'CONFIRMED',
          registeredAt: p.joined_at || p.registered_at
        })),
        confirmed_count: confirmed.length,
        pending_count: pending.length,
        total_participants: participants.length,
        balance_slots: balanceSlots
      };
    }).reverse();

    res.json({ success: true, tournaments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tournaments/create', checkAdminAuth, async (req, res) => {
  try {
    const title = req.body.title || req.body.name;
    const game = req.body.game;
    const mode = req.body.formatMode || req.body.mode;
    const max_participants = parseInt(req.body.max_participants || req.body.maxSlots || req.body.max, 10);
    const entry_fee = req.body.entry_fee || req.body.entryFee || req.body.fee;
    const prize_pool = req.body.prize_pool || req.body.prizePool || req.body.prize;
    const rules_text = req.body.rules_text || req.body.rules || '';
    const schedule_date = req.body.schedule_date || req.body.date || null;
    const schedule_time = req.body.schedule_time || req.body.time || null;
    const dashboard_channel_id = req.body.dashboard_channel_id || req.body.channelId || null;

    const rounds = req.body.rounds || null;
    const maps = req.body.maps || null;
    const location = req.body.location || null;
    const round_name = req.body.round_name || null;

    if (!title || !game || !max_participants || !entry_fee || !prize_pool) {
      return res.status(400).json({ success: false, message: 'Please fill in all required tournament fields.' });
    }

    const result = await botBridge.hostTournament({
      title,
      game,
      mode,
      max_participants,
      entry_fee,
      prize_pool,
      rules_text,
      schedule_date,
      schedule_time,
      location,
      round_name,
      rounds,
      maps,
      dashboard_channel_id
    });

    res.json({ success: true, message: `Tournament #${result.tournamentId} successfully created and posted to Discord!`, tournamentId: result.tournamentId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Broadcast Custom Room ID & Password to confirmed participants
app.post('/api/tournaments/:id/broadcast-room', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const { room_id, room_pass, map_name } = req.body;
    if (!room_id || !room_pass) {
      return res.status(400).json({ success: false, message: 'Room ID and Room Password are required.' });
    }
    const result = await botBridge.broadcastRoomCredentials(tournamentId, room_id, room_pass, map_name || 'Match Room');
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tournaments/:id/start', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const result = await botBridge.startTournament(tournamentId);
    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tournaments/:id/close', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const { winner, deleteChannels } = req.body;
    const result = await botBridge.closeTournament(tournamentId, winner || 'Winner Announced', Boolean(deleteChannels));
    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Participants Endpoints
app.get('/api/tournaments/:id/participants', checkAdminAuth, (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const storage = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/storage.json'), 'utf-8'));
    const tourney = (storage.tournaments || []).find(t => t.id === tournamentId) || { id: tournamentId };
    const rawParticipants = (storage.tournament_participants || []).filter(p => p.tournament_id === tournamentId);

    const participants = rawParticipants.map(p => ({
      ...p,
      userId: p.user_id,
      teamName: p.team_name || p.squad_name || 'Solo',
      ign: p.in_game_id || p.ingame_id || p.ign || 'N/A',
      slotStatus: p.payment_status,
      paid: p.payment_status === 'CONFIRMED',
      registeredAt: p.joined_at || p.registered_at
    }));

    res.json({
      success: true,
      tournament: {
        ...tourney,
        title: tourney.name || tourney.title,
        maxSlots: tourney.max_participants || tourney.maxSlots,
        formatMode: tourney.mode || tourney.formatMode
      },
      participants
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tournaments/:id/remove-participant', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const user_id = req.body.user_id || req.body.userId;
    if (!user_id) return res.status(400).json({ success: false, message: 'User ID is required' });

    const result = await botBridge.removeParticipant(tournamentId, user_id);
    res.json({ success: true, message: result.message || 'Participant removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tournaments/:id/add-participant', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const teamName = req.body.teamName || req.body.team_name || req.body.squadName || req.body.name;
    const ign = req.body.ign || req.body.in_game_id || req.body.ingameId || req.body.gameId;
    const userId = req.body.userId || req.body.user_id;
    const username = req.body.username || req.body.tag || req.body.player;
    const slotStatus = req.body.slotStatus || req.body.payment_status || req.body.status || 'CONFIRMED';
    const utr = req.body.utr || req.body.transaction_id || 'Admin Entry';

    if (!teamName || !ign) {
      return res.status(400).json({ success: false, message: 'Team Name and In-Game ID / IGN are required.' });
    }

    const result = await botBridge.addParticipant(tournamentId, {
      teamName,
      ign,
      userId,
      username,
      slotStatus,
      utr
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tournaments/:id/update-participant-status', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const userId = req.body.userId || req.body.user_id;
    const status = req.body.status || req.body.slotStatus || req.body.payment_status;

    if (!userId || !status) {
      return res.status(400).json({ success: false, message: 'User ID and Status are required.' });
    }

    const result = await botBridge.updateParticipantStatus(tournamentId, userId, status.toUpperCase());
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Scoreboard Endpoints
app.get('/api/tournaments/:id/scoreboard', checkAdminAuth, (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const storage = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/storage.json'), 'utf-8'));
    const tourney = (storage.tournaments || []).find(t => t.id === tournamentId) || null;
    const entries = (storage.scoreboard_entries || []).filter(e => e.tournament_id === tournamentId);
    res.json({
      success: true,
      tournament: tourney,
      entries
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tournaments/:id/score', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const round = req.body.round;
    const player1 = req.body.player1 || req.body.p1;
    const player2 = req.body.player2 || req.body.p2 || 'N/A';
    const score = req.body.score || req.body.result;
    const winner = req.body.winner || player1;
    const kills = req.body.kills !== undefined ? req.body.kills : null;
    const kda = req.body.kda || null;
    const proofUrl = req.body.proofUrl || req.body.proof_url || null;
    const efootballId = req.body.efootballId || req.body.efootball_id || null;
    const efootballPass = req.body.efootballPass || req.body.efootball_pass || null;

    if (!round || !player1 || !score) {
      return res.status(400).json({ success: false, message: 'Round, Player/Team 1, and Score are required.' });
    }

    const result = await botBridge.updateScoreboard(tournamentId, round, player1, player2, score, winner, {
      kills,
      kda,
      proofUrl,
      efootballId,
      efootballPass
    });
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/tournaments/:id/score/:entryId', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const entryId = parseInt(req.params.entryId, 10);
    const result = await botBridge.deleteScoreboardEntry(tournamentId, entryId);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Scoreboard & Match Self-Reporting Endpoints
app.get('/api/tournaments/:id/matches', async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const matches = dbQueries.getTournamentMatches(tournamentId);
    res.json({ success: true, matches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tournaments/:id/matches/create', checkAdminAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const { round_name, bracket_pos, player1, player1_id, player2, player2_id, table_number, next_match_id } = req.body;
    if (!player1) {
      return res.status(400).json({ success: false, message: 'Player/Team 1 is required.' });
    }
    const newMatch = dbQueries.createMatch({
      tournament_id: tournamentId,
      round_name: round_name || 'Round 1',
      bracket_pos,
      player1,
      player1_id,
      player2: player2 || 'TBD',
      player2_id,
      table_number,
      next_match_id
    });
    res.json({ success: true, match: newMatch });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Table Assignment by TD -> Sends notification text/DM to both players with link
app.post('/api/matches/:id/assign-table', checkAdminAuth, async (req, res) => {
  try {
    const matchId = req.params.id;
    const { table_number } = req.body;
    if (!table_number) {
      return res.status(400).json({ success: false, message: 'Table number is required.' });
    }
    const result = await botBridge.assignMatchTable(matchId, table_number);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public / Mobile Live Score Query by Match Code
app.get('/api/live-score/:code', (req, res) => {
  try {
    const code = req.params.code;
    const match = dbQueries.getMatchByCode(code);
    if (!match) return res.status(404).json({ success: false, message: 'Match code not found.' });

    const tournament = dbQueries.getTournament(match.tournament_id);
    res.json({ success: true, match, tournament });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Real-time score ticker update from player device
app.post('/api/live-score/:code/update', async (req, res) => {
  try {
    const code = req.params.code;
    const { player1_score, player2_score, live_score, updated_by } = req.body;
    const match = dbQueries.getMatchByCode(code);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found.' });

    const result = await botBridge.updateMatchLiveScore(match.id, {
      player1_score,
      player2_score,
      live_score,
      updated_by
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Player submits final score to TD for approval
app.post('/api/live-score/:code/submit', async (req, res) => {
  try {
    const code = req.params.code;
    const { submitted_score, submitted_winner, submitted_by } = req.body;
    if (!submitted_score || !submitted_winner) {
      return res.status(400).json({ success: false, message: 'Score and Winner are required.' });
    }
    const match = dbQueries.getMatchByCode(code);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found.' });

    const result = await botBridge.submitMatchSelfReport(match.id, {
      submitted_score,
      submitted_winner,
      submitted_by: submitted_by || 'Player'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// TD review and approve pending scores in Tournament Builder
app.get('/api/tournaments/:id/pending-matches', checkAdminAuth, (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const pendingMatches = dbQueries.getPendingApprovalMatches(tournamentId);
    res.json({ success: true, pendingMatches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/matches/:id/approve', checkAdminAuth, async (req, res) => {
  try {
    const matchId = req.params.id;
    const { final_score, final_winner } = req.body;
    const result = await botBridge.approveMatchReport(matchId, final_score, final_winner);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Payments Endpoints
app.get('/api/payments', checkAdminAuth, (req, res) => {
  try {
    const storage = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/storage.json'), 'utf-8'));
    const payments = (storage.payments || []).map(p => ({
      ...p,
      userId: p.user_id,
      teamName: p.squad_name || p.team_name,
      ign: p.game_id || p.ign,
      screenshotUrl: p.screenshot_url,
      proofUrl: p.screenshot_url
    })).reverse();
    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/payments/:id/approve', checkAdminAuth, async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { note } = req.body;
    const result = await botBridge.approvePayment(paymentId, note || 'Approved via Web Dashboard');
    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/payments/:id/reject', checkAdminAuth, async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const result = await botBridge.rejectPayment(paymentId, reason || 'Rejected via Web Dashboard');
    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/payments/:id/request-proof', checkAdminAuth, async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { note } = req.body;
    const result = await botBridge.requestProof(paymentId, note || 'Please upload clear screenshot showing 12-digit UTR');
    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Tickets Endpoint
app.get('/api/tickets', checkAdminAuth, (req, res) => {
  try {
    const storage = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/storage.json'), 'utf-8'));
    const tickets = (storage.tickets || []).slice().reverse();
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tickets/:channelId/close', checkAdminAuth, async (req, res) => {
  try {
    const { channelId } = req.params;
    const result = await botBridge.closeTicket(channelId);
    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, message: 'Ticket closed and archived.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Announcement Broadcaster Endpoint (Supports Multiple Channels)
app.post('/api/announcements', checkAdminAuth, async (req, res) => {
  try {
    const { channelId, channelIds, title, message, ping, color, imageUrl } = req.body;
    const targetChannels = Array.isArray(channelIds) && channelIds.length > 0 
      ? channelIds 
      : (channelId ? [channelId] : []);

    if (targetChannels.length === 0 || !title || !message) {
      return res.status(400).json({ success: false, message: 'At least one target Channel, Title, and Message are required.' });
    }

    const results = [];
    for (const chId of targetChannels) {
      const resSingle = await botBridge.sendAnnouncement({ channelId: chId, title, message, ping, color, imageUrl });
      results.push(resSingle);
    }

    const successful = results.filter(r => r && r.success).length;
    res.json({
      success: true,
      message: `Announcement "${title}" broadcasted to ${successful} Discord channel(s)!`,
      results
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 10. Server Setup Controller Endpoint
app.post('/api/setup', checkAdminAuth, async (req, res) => {
  try {
    const { type, cleanRebuild, channelId } = req.body;
    const result = await botBridge.runSetup(type || 'all', { cleanRebuild: Boolean(cleanRebuild), channelId });
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. SPORTS LEAGUE & TOURNAMENT MANAGEMENT ENDPOINTS (School / State Meets)
// ═══════════════════════════════════════════════════════════════════════════

// List all sports leagues
app.get('/api/leagues', (req, res) => {
  try {
    const leagues = dbQueries.getLeagues();
    res.json({ success: true, leagues });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create a new Sports League / Meet
app.post('/api/leagues/create', checkAdminAuth, (req, res) => {
  try {
    const { name, sport, age_category, gender_category, location, start_date, end_date, max_teams, format } = req.body;
    if (!name || !sport) {
      return res.status(400).json({ success: false, message: 'League Name and Sport are required.' });
    }

    const league = dbQueries.createLeague({
      name,
      sport,
      age_category: age_category || 'Open',
      gender_category: gender_category || 'Boys',
      location: location || 'State Sports Complex',
      start_date,
      end_date,
      max_teams: parseInt(max_teams, 10) || 10,
      format: format || 'POOLS_ROUND_ROBIN'
    });

    res.json({ success: true, league, message: '✅ Sports League created successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get league details, teams and matches
app.get('/api/leagues/:id', (req, res) => {
  try {
    const leagueId = parseInt(req.params.id, 10);
    const league = dbQueries.getLeague(leagueId);
    if (!league) return res.status(404).json({ success: false, message: 'League not found.' });

    const teams = dbQueries.getLeagueTeams(leagueId);
    const standings = dbQueries.calculateLeagueStandings(leagueId);
    const storage = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/storage.json'), 'utf-8'));
    const matches = (storage.matches || []).filter(m => m.league_id === leagueId);

    res.json({
      success: true,
      league,
      teams,
      standings,
      matches
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Register Team into League (Supports Team Managers & Admin, max 10 validation)
app.post('/api/leagues/:id/teams', checkAnyAuth, (req, res) => {
  try {
    const leagueId = parseInt(req.params.id, 10);
    const { name, district, coach, contact, pool } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Team Name is required.' });
    }

    const result = dbQueries.registerLeagueTeam(leagueId, {
      name,
      district: district || 'State District',
      coach: coach || 'Head Coach',
      contact: contact || '',
      pool: pool || 'Pool A'
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Calculate and fetch live standings
app.get('/api/leagues/:id/standings', (req, res) => {
  try {
    const leagueId = parseInt(req.params.id, 10);
    const standings = dbQueries.calculateLeagueStandings(leagueId);
    res.json({ success: true, standings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Schedule Match for League with duplicate prevention and validation
app.post('/api/leagues/:id/matches/schedule', checkAnyAuth, (req, res) => {
  try {
    const leagueId = parseInt(req.params.id, 10);
    const { round_name, player1, player2, table_number, match_date, match_time, bracket_pos } = req.body;

    if (!player1 || !player2) {
      return res.status(400).json({ success: false, message: 'Both Team 1 and Team 2 are required.' });
    }
    if (player1.trim().toLowerCase() === player2.trim().toLowerCase()) {
      return res.status(400).json({ success: false, message: 'A team cannot play against itself!' });
    }

    const storage = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/storage.json'), 'utf-8'));
    // Prevent duplicate active fixtures
    const duplicate = (storage.matches || []).find(m => 
      m.league_id === leagueId && 
      m.round_name === round_name && 
      ((m.player1 === player1 && m.player2 === player2) || (m.player1 === player2 && m.player2 === player1))
    );
    if (duplicate) {
      return res.status(400).json({ success: false, message: 'This fixture has already been scheduled for this round!' });
    }

    const newMatch = dbQueries.createMatch({
      league_id: leagueId,
      tournament_id: 0,
      round_name: round_name || 'Group Stage',
      bracket_pos: bracket_pos || 'GROUP',
      player1: player1.trim(),
      player2: player2.trim(),
      table_number: table_number || 'Court / Ground 1',
      scheduled_date: match_date || null,
      scheduled_time: match_time || null,
      status: 'SCHEDULED'
    });

    res.json({ success: true, match: newMatch, message: 'Match scheduled successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update League Match Score (Accessible by Referee or Admin)
app.post('/api/leagues/:id/matches/:matchId/score', checkAnyAuth, async (req, res) => {
  try {
    const leagueId = parseInt(req.params.id, 10);
    const matchId = parseInt(req.params.matchId, 10);
    const { player1_score, player2_score, status, winner } = req.body;

    const s1 = parseInt(player1_score, 10) || 0;
    const s2 = parseInt(player2_score, 10) || 0;

    let computedWinner = winner;
    if (!computedWinner) {
      if (s1 > s2) computedWinner = 'TEAM_1';
      else if (s2 > s1) computedWinner = 'TEAM_2';
      else computedWinner = 'DRAW';
    }

    const updated = dbQueries.updateMatch(matchId, {
      player1_score: s1,
      player2_score: s2,
      live_score: `${s1} - ${s2}`,
      winner: computedWinner,
      status: status || 'COMPLETED',
      completed_at: status === 'COMPLETED' ? new Date().toISOString() : null
    });

    // Recompute standings
    const standings = dbQueries.calculateLeagueStandings(leagueId);

    // If playoff match completed and has next_match_id, forward winner
    if (status === 'COMPLETED' && updated && updated.next_match_id) {
      const nextMatch = dbQueries.getMatch(updated.next_match_id);
      if (nextMatch) {
        const winningTeamName = computedWinner === 'TEAM_1' ? updated.player1 : (computedWinner === 'TEAM_2' ? updated.player2 : updated.player1);
        if (updated.bracket_pos === 'SF-1') {
          dbQueries.updateMatch(nextMatch.id, { player1: winningTeamName });
        } else if (updated.bracket_pos === 'SF-2') {
          dbQueries.updateMatch(nextMatch.id, { player2: winningTeamName });
        }
      }
    }

    res.json({ success: true, match: updated, standings, message: 'Score updated and standings recalculated!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Auto-generate Semifinal & Final Playoffs from Pool Standings
app.post('/api/leagues/:id/generate-playoffs', checkAdminAuth, (req, res) => {
  try {
    const leagueId = parseInt(req.params.id, 10);
    const result = dbQueries.generatePlayoffsMatches(leagueId);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Dedicated Mobile Live Scoring & Self-Report Page for Players
app.get('/live-score', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/live-score.html'));
});

// Dedicated Esports Broadcast Overlays for OBS / vMix / WASP3D (TournaLink Suite)
app.get('/overlay/leaderboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/overlay-leaderboard.html'));
});
app.get('/overlay/ticker', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/overlay-ticker.html'));
});
app.get('/overlay/winner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/overlay-winner.html'));
});

// Live Broadcast Data Feed for WASP3D, OBS Browser Sources & TournaLink
let overlayBroadcastStates = {}; // tourneyId -> { state, activeMatchId }

app.get('/api/overlay/data', (req, res) => {
  try {
    const tourneyId = parseInt(req.query.tourneyId, 10);
    const tournament = tourneyId ? dbQueries.getTournament(tourneyId) : (dbQueries.getActiveTournaments() || [])[0];
    if (!tournament) {
      return res.json({ success: false, message: 'Tournament not found' });
    }

    const tId = tournament.id;
    const participants = dbQueries.getConfirmedParticipants(tId);
    const scoreboardEntries = dbQueries.getScoreboard(tId);
    const matches = dbQueries.getTournamentMatches(tId);

    // Calculate dynamic team standings
    const standingsMap = {};
    participants.forEach(p => {
      const name = p.squad_name || p.team_name || p.username || 'Solo';
      standingsMap[name] = { teamName: name, kills: 0, wins: 0, totalPoints: 0, matchesPlayed: 0 };
    });

    scoreboardEntries.forEach(entry => {
      const team1 = entry.player1;
      const team2 = entry.player2;
      const winner = entry.winner;

      if (!standingsMap[team1]) standingsMap[team1] = { teamName: team1, kills: 0, wins: 0, totalPoints: 0, matchesPlayed: 0 };
      standingsMap[team1].matchesPlayed += 1;

      // Parse score kills / points
      const scoreNum = parseInt(entry.score, 10) || 0;
      standingsMap[team1].kills += scoreNum;

      if (winner && winner.toLowerCase() === team1.toLowerCase()) {
        standingsMap[team1].wins += 1;
        standingsMap[team1].totalPoints += 10; // 10 pts for 1st place in PUBG standard
      }
      standingsMap[team1].totalPoints += scoreNum; // 1 pt per kill
    });

    const standings = Object.values(standingsMap).sort((a, b) => b.totalPoints - a.totalPoints || b.kills - a.kills);

    const bState = overlayBroadcastStates[tId] || {};
    const activeMatch = bState.activeMatchId ? matches.find(m => m.id === Number(bState.activeMatchId)) : matches[0];

    res.json({
      success: true,
      tournament,
      standings,
      matches,
      activeMatch: activeMatch || null,
      scoreboardEntries,
      matchesLogged: scoreboardEntries.length,
      broadcastState: bState.state || 'standings'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/overlay/set-active-match', checkAdminAuth, (req, res) => {
  const { tourneyId, matchId } = req.body;
  if (!overlayBroadcastStates[tourneyId]) overlayBroadcastStates[tourneyId] = {};
  overlayBroadcastStates[tourneyId].activeMatchId = matchId;
  res.json({ success: true, message: 'Active stream match updated' });
});

app.post('/api/overlay/set-state', checkAdminAuth, (req, res) => {
  const { tourneyId, state } = req.body;
  if (!overlayBroadcastStates[tourneyId]) overlayBroadcastStates[tourneyId] = {};
  overlayBroadcastStates[tourneyId].state = state;
  res.json({ success: true, message: `Overlay state set to ${state}` });
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Server Starter Function
function startServer(port = PORT) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 Tournament Management Software running at:`);
    console.log(`   👉 http://localhost:${port}`);
    console.log(`   👉 http://127.0.0.1:${port}`);
    console.log(`🔑 Admin Secret Access Key: ${ADMIN_SECRET}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });

  server.on('error', (err) => {
    console.error(`[WebServer] Server error on port ${port}:`, err.message);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
