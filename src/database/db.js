const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = path.join(dataDir, 'storage.json');

// Default initial state
const defaultState = {
  guild_settings: {},
  tournaments: [],
  tournament_participants: [],
  scoreboard_entries: [],
  payments: [],
  invoices: [],
  tickets: [],
  counters: {
    tournament_id: 0,
    payment_id: 1000,
    invoice_id: 5000,
    ticket_numbers: {} // guildId -> number
  }
};

let inMemoryData = null;

function loadDatabase() {
  if (inMemoryData) return inMemoryData;

  if (fs.existsSync(dbFilePath)) {
    try {
      const raw = fs.readFileSync(dbFilePath, 'utf-8');
      inMemoryData = JSON.parse(raw);
      // Ensure all keys exist
      inMemoryData.guild_settings = inMemoryData.guild_settings || {};
      inMemoryData.tournaments = inMemoryData.tournaments || [];
      inMemoryData.tournament_participants = inMemoryData.tournament_participants || [];
      inMemoryData.scoreboard_entries = inMemoryData.scoreboard_entries || [];
      inMemoryData.payments = inMemoryData.payments || [];
      inMemoryData.invoices = inMemoryData.invoices || [];
      inMemoryData.tickets = inMemoryData.tickets || [];
      inMemoryData.counters = inMemoryData.counters || {
        tournament_id: 0,
        payment_id: 1000,
        invoice_id: 5000,
        ticket_numbers: {}
      };
      if (inMemoryData.counters.payment_id === undefined) inMemoryData.counters.payment_id = 1000;
      if (inMemoryData.counters.invoice_id === undefined) inMemoryData.counters.invoice_id = 5000;
    } catch (err) {
      console.error('[Database] Failed to parse existing storage.json, initializing fresh state:', err);
      inMemoryData = JSON.parse(JSON.stringify(defaultState));
    }
  } else {
    inMemoryData = JSON.parse(JSON.stringify(defaultState));
    saveDatabase();
  }
  return inMemoryData;
}

function saveDatabase() {
  try {
    const tempFile = `${dbFilePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(inMemoryData, null, 2), 'utf-8');
    fs.renameSync(tempFile, dbFilePath);
  } catch (err) {
    console.error('[Database] Error saving database:', err);
  }
}

// Initial load
loadDatabase();

const dbQueries = {
  // Guild Settings
  getGuildSettings: (guildId) => {
    const data = loadDatabase();
    return data.guild_settings[guildId] || null;
  },

  updateGuildSettings: (guildId, settings) => {
    const data = loadDatabase();
    const current = data.guild_settings[guildId] || { guild_id: guildId };
    data.guild_settings[guildId] = {
      ...current,
      ...settings,
      guild_id: guildId,
      updated_at: new Date().toISOString()
    };
    saveDatabase();
    return data.guild_settings[guildId];
  },

  // Tournaments
  createTournament: (tournamentData) => {
    const data = loadDatabase();
    data.counters.tournament_id += 1;
    const newId = data.counters.tournament_id;

    const newTournament = {
      id: newId,
      guild_id: tournamentData.guild_id,
      title: tournamentData.title,
      game: tournamentData.game,
      mode: tournamentData.mode || (tournamentData.title && tournamentData.title.toLowerCase().includes('duo') ? 'duo' : (tournamentData.title && tournamentData.title.toLowerCase().includes('squad') ? 'squad' : 'solo')),
      max_participants: Number(tournamentData.max_participants),
      entry_fee: tournamentData.entry_fee,
      prize_pool: tournamentData.prize_pool,
      gpay_info: tournamentData.gpay_info,
      rules_text: tournamentData.rules_text || '',
      status: tournamentData.status || 'OPEN',
      dashboard_channel_id: tournamentData.dashboard_channel_id || null,
      dashboard_message_id: tournamentData.dashboard_message_id || null,
      category_id: tournamentData.category_id || null,
      announcements_channel_id: tournamentData.announcements_channel_id || null,
      chat_channel_id: tournamentData.chat_channel_id || null,
      scores_channel_id: tournamentData.scores_channel_id || null,
      voice_channel_ids: tournamentData.voice_channel_ids || [],
      tournament_role_id: tournamentData.tournament_role_id || null,
      pending_role_id: tournamentData.pending_role_id || null,
      created_by: tournamentData.created_by,
      created_at: new Date().toISOString()
    };

    data.tournaments.push(newTournament);
    saveDatabase();
    return newId;
  },

  getTournament: (id) => {
    const data = loadDatabase();
    return data.tournaments.find(t => t.id === Number(id)) || null;
  },

  getTournamentByDashboardMsg: (messageId) => {
    const data = loadDatabase();
    return data.tournaments.find(t => t.dashboard_message_id === messageId) || null;
  },

  getActiveTournaments: (guildId) => {
    const data = loadDatabase();
    return data.tournaments.filter(t => t.guild_id === guildId && t.status === 'OPEN');
  },

  updateTournament: (id, updateFields) => {
    const data = loadDatabase();
    const index = data.tournaments.findIndex(t => t.id === Number(id));
    if (index === -1) return null;

    data.tournaments[index] = {
      ...data.tournaments[index],
      ...updateFields,
      id: Number(id)
    };
    saveDatabase();
    return data.tournaments[index];
  },

  closeTournament: (id, status = 'COMPLETED') => {
    const data = loadDatabase();
    const tournament = data.tournaments.find(t => t.id === Number(id));
    if (tournament) {
      tournament.status = status;
      tournament.closed_at = new Date().toISOString();
      saveDatabase();
    }
    return tournament;
  },

  // Tournament Participants
  addParticipant: (tournamentId, userId, username, ingameId = null, paymentStatus = 'PENDING', transactionId = null, squadName = 'Solo') => {
    const data = loadDatabase();
    const tId = Number(tournamentId);

    // Prevent duplicates
    const exists = data.tournament_participants.some(p => p.tournament_id === tId && p.user_id === userId);
    if (exists) return false;

    data.tournament_participants.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      tournament_id: tId,
      user_id: userId,
      username,
      ingame_id: ingameId,
      squad_name: squadName || 'Solo',
      transaction_id: transactionId,
      payment_status: paymentStatus,
      registered_at: new Date().toISOString()
    });

    saveDatabase();
    return true;
  },

  approveParticipant: (tournamentId, userId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    const participant = data.tournament_participants.find(p => p.tournament_id === tId && p.user_id === userId);
    if (participant) {
      participant.payment_status = 'CONFIRMED';
      saveDatabase();
      return participant;
    }
    return null;
  },

  updateParticipantStatus: (tournamentId, userId, newStatus) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    const participant = data.tournament_participants.find(p => p.tournament_id === tId && p.user_id === userId);
    if (participant) {
      participant.payment_status = newStatus;
      participant.updated_at = new Date().toISOString();
      saveDatabase();
      return participant;
    }
    return null;
  },

  removeParticipant: (tournamentId, userId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    const initialLength = data.tournament_participants.length;
    data.tournament_participants = data.tournament_participants.filter(
      p => !(p.tournament_id === tId && p.user_id === userId)
    );
    saveDatabase();
    return data.tournament_participants.length < initialLength;
  },

  getParticipants: (tournamentId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    return data.tournament_participants.filter(p => p.tournament_id === tId);
  },

  getConfirmedParticipants: (tournamentId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    return data.tournament_participants.filter(p => p.tournament_id === tId && p.payment_status === 'CONFIRMED');
  },

  getPendingParticipants: (tournamentId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    return data.tournament_participants.filter(p => p.tournament_id === tId && p.payment_status === 'PENDING');
  },

  isParticipant: (tournamentId, userId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    return data.tournament_participants.some(p => p.tournament_id === tId && p.user_id === userId);
  },

  getParticipantCount: (tournamentId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    return data.tournament_participants.filter(p => p.tournament_id === tId && p.payment_status === 'CONFIRMED').length;
  },

  // Scoreboard Management
  addScoreboardEntry: (dataObj) => {
    const data = loadDatabase();
    const newEntry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      tournament_id: Number(dataObj.tournament_id),
      round_name: dataObj.round_name,
      player1: dataObj.player1,
      player2: dataObj.player2,
      score: dataObj.score,
      winner: dataObj.winner,
      notes: dataObj.notes || '',
      updated_by: dataObj.updated_by,
      created_at: new Date().toISOString()
    };
    data.scoreboard_entries.push(newEntry);
    saveDatabase();
    return newEntry;
  },

  getScoreboardEntries: (tournamentId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    return data.scoreboard_entries.filter(e => e.tournament_id === tId);
  },

  getScoreboard: (tournamentId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    return data.scoreboard_entries.filter(e => e.tournament_id === tId);
  },

  deleteScoreboardEntry: (entryId) => {
    const data = loadDatabase();
    const eId = Number(entryId);
    const initial = data.scoreboard_entries.length;
    data.scoreboard_entries = data.scoreboard_entries.filter(e => e.id !== eId);
    saveDatabase();
    return data.scoreboard_entries.length < initial;
  },


  // Payment System & Ledger
  createPayment: (paymentData) => {
    const data = loadDatabase();
    data.counters.payment_id += 1;
    const paymentId = data.counters.payment_id;

    const newPayment = {
      id: paymentId,
      guild_id: paymentData.guild_id,
      user_id: paymentData.user_id,
      username: paymentData.username,
      amount: paymentData.amount || '0',
      utr: paymentData.utr || 'N/A',
      screenshot_url: paymentData.screenshot_url || null,
      purpose: paymentData.purpose || 'Tournament Entry Fee',
      tournament_id: paymentData.tournament_id ? Number(paymentData.tournament_id) : null,
      squad_name: paymentData.squad_name || null,
      game_id: paymentData.game_id || null,
      gateway_type: paymentData.gateway_type || 'DOMESTIC',
      status: 'PENDING',
      admin_note: '',
      verified_by: null,
      invoice_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    data.payments.push(newPayment);
    saveDatabase();
    return newPayment;
  },

  getPayment: (paymentId) => {
    const data = loadDatabase();
    return data.payments.find(p => p.id === Number(paymentId)) || null;
  },

  getPaymentByUtr: (utr) => {
    if (!utr || utr === 'N/A') return null;
    const data = loadDatabase();
    return data.payments.find(p => p.utr && p.utr.toLowerCase() === utr.toLowerCase()) || null;
  },

  getUserPayments: (userId) => {
    const data = loadDatabase();
    return data.payments.filter(p => p.user_id === userId);
  },

  getPendingPayments: (guildId) => {
    const data = loadDatabase();
    return data.payments.filter(p => (!guildId || p.guild_id === guildId) && p.status === 'PENDING');
  },

  getAllPayments: (guildId) => {
    const data = loadDatabase();
    return data.payments.filter(p => !guildId || p.guild_id === guildId);
  },

  approvePaymentRecord: (paymentId, adminId, note = '') => {
    const data = loadDatabase();
    const payment = data.payments.find(p => p.id === Number(paymentId));
    if (payment) {
      payment.status = 'APPROVED';
      payment.verified_by = adminId;
      payment.admin_note = note;
      payment.updated_at = new Date().toISOString();

      // Create an Invoice
      data.counters.invoice_id += 1;
      const invoiceId = `INV-${data.counters.invoice_id}`;
      const newInvoice = {
        invoice_id: invoiceId,
        payment_id: payment.id,
        guild_id: payment.guild_id,
        user_id: payment.user_id,
        username: payment.username,
        amount: payment.amount,
        purpose: payment.purpose,
        utr: payment.utr,
        status: 'PAID',
        issued_at: new Date().toISOString()
      };
      data.invoices.push(newInvoice);
      payment.invoice_id = invoiceId;

      saveDatabase();
      return { payment, invoice: newInvoice };
    }
    return null;
  },

  rejectPaymentRecord: (paymentId, adminId, reason = 'Invalid transaction reference or proof') => {
    const data = loadDatabase();
    const payment = data.payments.find(p => p.id === Number(paymentId));
    if (payment) {
      payment.status = 'REJECTED';
      payment.verified_by = adminId;
      payment.admin_note = reason;
      payment.updated_at = new Date().toISOString();
      saveDatabase();
      return payment;
    }
    return null;
  },

  requestMoreProofRecord: (paymentId, adminId, note = 'Please provide a clearer screenshot with UTR number') => {
    const data = loadDatabase();
    const payment = data.payments.find(p => p.id === Number(paymentId));
    if (payment) {
      payment.status = 'ACTION_REQUIRED';
      payment.verified_by = adminId;
      payment.admin_note = note;
      payment.updated_at = new Date().toISOString();
      saveDatabase();
      return payment;
    }
    return null;
  },

  updatePaymentRecord: (paymentId, updateFields) => {
    const data = loadDatabase();
    const payment = data.payments.find(p => p.id === Number(paymentId));
    if (payment) {
      Object.assign(payment, updateFields, { updated_at: new Date().toISOString() });
      saveDatabase();
      return payment;
    }
    return null;
  },

  getPaymentStats: (guildId) => {
    const data = loadDatabase();
    const payments = data.payments.filter(p => !guildId || p.guild_id === guildId);
    const approved = payments.filter(p => p.status === 'APPROVED');
    const pending = payments.filter(p => p.status === 'PENDING');
    const rejected = payments.filter(p => p.status === 'REJECTED');

    let totalRevenue = 0;
    for (const p of approved) {
      const numeric = parseFloat(String(p.amount).replace(/[^0-9.]/g, ''));
      if (!isNaN(numeric)) totalRevenue += numeric;
    }

    return {
      totalTransactions: payments.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      rejectedCount: rejected.length,
      totalRevenue: `₹${totalRevenue.toLocaleString('en-IN')}`
    };
  },

  getInvoice: (invoiceId) => {
    const data = loadDatabase();
    return data.invoices.find(i => i.invoice_id === invoiceId) || null;
  },

  // Tickets
  createTicket: (guildId, userId, username, channelId, category = 'General Support') => {
    const data = loadDatabase();
    data.counters.ticket_numbers[guildId] = (data.counters.ticket_numbers[guildId] || 0) + 1;
    const ticketNumber = data.counters.ticket_numbers[guildId];

    const newTicket = {
      id: Date.now(),
      guild_id: guildId,
      ticket_number: ticketNumber,
      user_id: userId,
      username,
      channel_id: channelId,
      category,
      status: 'OPEN',
      claimed_by: null,
      created_at: new Date().toISOString(),
      closed_at: null
    };

    data.tickets.push(newTicket);
    saveDatabase();
    return { ticketNumber };
  },

  getTicketByChannel: (channelId) => {
    const data = loadDatabase();
    return data.tickets.find(t => t.channel_id === channelId) || null;
  },

  getUserOpenTicket: (guildId, userId) => {
    const data = loadDatabase();
    return data.tickets.find(t => t.guild_id === guildId && t.user_id === userId && t.status !== 'CLOSED') || null;
  },

  claimTicket: (channelId, staffId) => {
    const data = loadDatabase();
    const ticket = data.tickets.find(t => t.channel_id === channelId);
    if (ticket) {
      ticket.status = 'CLAIMED';
      ticket.claimed_by = staffId;
      saveDatabase();
    }
    return ticket;
  },

  closeTicket: (channelId) => {
    const data = loadDatabase();
    const ticket = data.tickets.find(t => t.channel_id === channelId);
    if (ticket) {
      ticket.status = 'CLOSED';
      ticket.closed_at = new Date().toISOString();
      saveDatabase();
    }
    return ticket;
  }
};

module.exports = {
  dbQueries
};
