require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const botBridge = require('./botBridge');
const { dbQueries } = require('../database/db');

const app = express();
const PORT = process.env.PORT || process.env.WEB_PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_WEB_SECRET || 'PLE-ADMIN-2026';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple Auth Middleware
function checkAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-key'] || req.query.key;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please enter Admin PIN.' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token !== ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: 'Invalid Admin PIN/Secret.' });
  }

  next();
}

// 1. Auth Endpoint
app.post('/api/auth/login', (req, res) => {
  const pin = req.body.pin || req.body.secret || req.body.password;
  if (pin && pin.trim() === ADMIN_SECRET) {
    return res.json({ success: true, token: ADMIN_SECRET, message: 'Login successful' });
  }
  return res.status(401).json({ success: false, message: 'Incorrect Admin PIN. Access denied.' });
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
    const dashboard_channel_id = req.body.dashboard_channel_id || req.body.channelId || null;

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
      dashboard_channel_id
    });

    res.json({ success: true, message: `Tournament #${result.tournamentId} successfully created and posted to Discord!`, tournamentId: result.tournamentId });
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

    if (!round || !player1 || !score) {
      return res.status(400).json({ success: false, message: 'Round, Player/Team 1, and Score are required.' });
    }

    const result = await botBridge.updateScoreboard(tournamentId, round, player1, player2, score, winner);
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

// 9. Announcement Broadcaster Endpoint
app.post('/api/announcements', checkAdminAuth, async (req, res) => {
  try {
    const { channelId, title, message, ping, color, imageUrl } = req.body;
    if (!channelId || !title || !message) {
      return res.status(400).json({ success: false, message: 'Channel, Title, and Message are required.' });
    }
    const result = await botBridge.sendAnnouncement({ channelId, title, message, ping, color, imageUrl });
    if (!result.success) return res.status(400).json(result);
    res.json(result);
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
