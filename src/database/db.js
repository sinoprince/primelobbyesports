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
      inMemoryData.leagues = inMemoryData.leagues || [];
      inMemoryData.sports_teams = inMemoryData.sports_teams || [];
      inMemoryData.tournament_participants = inMemoryData.tournament_participants || [];
      inMemoryData.scoreboard_entries = inMemoryData.scoreboard_entries || [];
      inMemoryData.matches = inMemoryData.matches || [];
      inMemoryData.payments = inMemoryData.payments || [];
      inMemoryData.invoices = inMemoryData.invoices || [];
      inMemoryData.tickets = inMemoryData.tickets || [];
      inMemoryData.counters = inMemoryData.counters || {
        tournament_id: 0,
        league_id: 10,
        payment_id: 1000,
        invoice_id: 5000,
        match_id: 100,
        ticket_numbers: {}
      };
      if (inMemoryData.counters.payment_id === undefined) inMemoryData.counters.payment_id = 1000;
      if (inMemoryData.counters.invoice_id === undefined) inMemoryData.counters.invoice_id = 5000;
      if (inMemoryData.counters.match_id === undefined) inMemoryData.counters.match_id = 100;
      if (inMemoryData.counters.league_id === undefined) inMemoryData.counters.league_id = 10;
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
      schedule_date: tournamentData.schedule_date || null,
      schedule_time: tournamentData.schedule_time || null,
      custom_room_id: tournamentData.custom_room_id || null,
      custom_room_pass: tournamentData.custom_room_pass || null,
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
      kills: dataObj.kills !== undefined ? dataObj.kills : null,
      kda: dataObj.kda || null,
      proof_url: dataObj.proof_url || null,
      efootball_id: dataObj.efootball_id || null,
      efootball_pass: dataObj.efootball_pass || null,
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

  // Match & Self-Reporting System
  createMatch: (matchData) => {
    const data = loadDatabase();
    data.counters.match_id = (data.counters.match_id || 100) + 1;
    const matchId = data.counters.match_id;

    // Generate unique 6-character match code (e.g., M-4X9B2)
    const code = matchData.match_code || `M-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const newMatch = {
      id: matchId,
      match_code: code,
      tournament_id: Number(matchData.tournament_id),
      round_name: matchData.round_name || 'Round 1',
      bracket_pos: matchData.bracket_pos || null, // e.g., 'QF-1', 'SF-1', 'F-1'
      next_match_id: matchData.next_match_id ? Number(matchData.next_match_id) : null,
      player1: matchData.player1, // Name or Team Name
      player1_id: matchData.player1_id || null, // Discord User ID or Player ID
      player1_score: matchData.player1_score !== undefined ? matchData.player1_score : 0,
      player2: matchData.player2 || 'TBD',
      player2_id: matchData.player2_id || null,
      player2_score: matchData.player2_score !== undefined ? matchData.player2_score : 0,
      table_number: matchData.table_number || null, // Table / Station / Room assigned by TD
      status: matchData.status || 'SCHEDULED', // SCHEDULED, ASSIGNED, IN_PROGRESS, PENDING_APPROVAL, COMPLETED
      assigned_at: matchData.assigned_at || null,
      assigned_by: matchData.assigned_by || null,
      live_score: matchData.live_score || '',
      submitted_score: matchData.submitted_score || null,
      submitted_winner: matchData.submitted_winner || null,
      submitted_by: matchData.submitted_by || null,
      submitted_at: null,
      winner: matchData.winner || null,
      approved_by: null,
      approved_at: null,
      created_at: new Date().toISOString()
    };

    data.matches.push(newMatch);
    saveDatabase();
    return newMatch;
  },

  getMatch: (matchId) => {
    const data = loadDatabase();
    return data.matches.find(m => m.id === Number(matchId) || m.match_code === String(matchId)) || null;
  },

  getMatchByCode: (code) => {
    const data = loadDatabase();
    const clean = String(code).trim().toUpperCase();
    return data.matches.find(m => m.match_code.toUpperCase() === clean) || null;
  },

  getTournamentMatches: (tournamentId) => {
    const data = loadDatabase();
    const tId = Number(tournamentId);
    return data.matches.filter(m => m.tournament_id === tId);
  },

  getPendingApprovalMatches: (tournamentId = null) => {
    const data = loadDatabase();
    return data.matches.filter(m => {
      const isPending = m.status === 'PENDING_APPROVAL';
      return tournamentId ? isPending && m.tournament_id === Number(tournamentId) : isPending;
    });
  },

  assignMatchToTable: (matchId, tableNumber, directorId) => {
    const data = loadDatabase();
    const match = data.matches.find(m => m.id === Number(matchId) || m.match_code === String(matchId));
    if (!match) return null;

    match.table_number = tableNumber;
    match.status = 'ASSIGNED';
    match.assigned_at = new Date().toISOString();
    match.assigned_by = directorId;
    saveDatabase();
    return match;
  },

  updateMatchLiveScore: (matchId, { player1_score, player2_score, live_score, updated_by }) => {
    const data = loadDatabase();
    const match = data.matches.find(m => m.id === Number(matchId) || m.match_code === String(matchId));
    if (!match) return null;

    if (player1_score !== undefined) match.player1_score = player1_score;
    if (player2_score !== undefined) match.player2_score = player2_score;
    if (live_score !== undefined) match.live_score = live_score;
    if (match.status === 'SCHEDULED' || match.status === 'ASSIGNED') {
      match.status = 'IN_PROGRESS';
    }
    match.last_updated_by = updated_by;
    match.last_updated_at = new Date().toISOString();
    saveDatabase();
    return match;
  },

  submitMatchSelfReport: (matchId, { submitted_score, submitted_winner, submitted_by }) => {
    const data = loadDatabase();
    const match = data.matches.find(m => m.id === Number(matchId) || m.match_code === String(matchId));
    if (!match) return null;

    match.submitted_score = submitted_score;
    match.submitted_winner = submitted_winner;
    match.submitted_by = submitted_by;
    match.submitted_at = new Date().toISOString();
    match.status = 'PENDING_APPROVAL';
    saveDatabase();
    return match;
  },

  approveMatchScore: (matchId, { approved_by, final_score = null, final_winner = null }) => {
    const data = loadDatabase();
    const match = data.matches.find(m => m.id === Number(matchId) || m.match_code === String(matchId));
    if (!match) return null;

    const winner = final_winner || match.submitted_winner || match.player1;
    const score = final_score || match.submitted_score || `${match.player1_score} - ${match.player2_score}`;

    match.winner = winner;
    match.status = 'COMPLETED';
    match.approved_by = approved_by;
    match.approved_at = new Date().toISOString();

    // Release table
    const releasedTable = match.table_number;
    match.table_released = true;

    // Advance winner in bracket if next_match_id exists
    let nextMatch = null;
    if (match.next_match_id) {
      nextMatch = data.matches.find(m => m.id === match.next_match_id);
      if (nextMatch) {
        if (!nextMatch.player1 || nextMatch.player1 === 'TBD') {
          nextMatch.player1 = winner;
          nextMatch.player1_id = match.submitted_by;
        } else if (!nextMatch.player2 || nextMatch.player2 === 'TBD') {
          nextMatch.player2 = winner;
          nextMatch.player2_id = match.submitted_by;
        }
      }
    }

    saveDatabase();
    return { match, releasedTable, nextMatch, winner, score };
  },

  deleteMatch: (matchId) => {
    const data = loadDatabase();
    const mId = Number(matchId);
    const initial = data.matches.length;
    data.matches = data.matches.filter(m => m.id !== mId);
    saveDatabase();
    return data.matches.length < initial;
  },

  // --- Sports League & Pool Management Suite ---
  createLeague: (leagueData) => {
    const data = loadDatabase();
    data.counters.league_id = (data.counters.league_id || 10) + 1;
    const newId = data.counters.league_id;

    const newLeague = {
      id: newId,
      name: leagueData.name,
      sport: leagueData.sport || 'Football', // Football, Basketball, Volleyball, Cricket, Kabaddi, Badminton, etc.
      category: leagueData.category || 'Open State', // School Under-14/17/19, Men, Women, Mixed, State Meet
      age_group: leagueData.age_group || 'All Ages',
      gender: leagueData.gender || 'Boys / Men',
      format: leagueData.format || 'ROUND_ROBIN_AND_KNOCKOUT', // ROUND_ROBIN, POOLS_TO_KNOCKOUT, SINGLE_ELIMINATION
      max_teams: Number(leagueData.max_teams) || 10,
      pools: leagueData.pools || ['Pool A', 'Pool B'],
      status: 'REGISTRATION', // REGISTRATION, GROUP_STAGE, PLAYOFFS, COMPLETED
      created_by: leagueData.created_by || 'League Admin',
      created_at: new Date().toISOString()
    };

    data.leagues.push(newLeague);
    saveDatabase();
    return newLeague;
  },

  getLeagues: () => {
    const data = loadDatabase();
    return data.leagues || [];
  },

  getLeague: (id) => {
    const data = loadDatabase();
    return (data.leagues || []).find(l => l.id === Number(id)) || null;
  },

  updateLeague: (id, updateFields) => {
    const data = loadDatabase();
    const idx = (data.leagues || []).findIndex(l => l.id === Number(id));
    if (idx === -1) return null;
    data.leagues[idx] = { ...data.leagues[idx], ...updateFields };
    saveDatabase();
    return data.leagues[idx];
  },

  // Teams in Sports League (School / State level teams up to 10 teams)
  registerLeagueTeam: (leagueId, teamData) => {
    const data = loadDatabase();
    const lId = Number(leagueId);

    const count = (data.sports_teams || []).filter(t => t.league_id === lId).length;
    if (count >= 10 && !teamData.bypassLimit) {
      return { success: false, message: 'Maximum 10 teams limit reached for this State / School event.' };
    }

    const newTeam = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      league_id: lId,
      name: teamData.name,
      school_district: teamData.school_district || 'District / Club',
      manager_name: teamData.manager_name || 'Coach',
      manager_phone: teamData.manager_phone || '',
      pool: teamData.pool || 'Pool A', // Pool A or Pool B
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
      registered_at: new Date().toISOString()
    };

    data.sports_teams.push(newTeam);
    saveDatabase();
    return { success: true, team: newTeam };
  },

  getLeagueTeams: (leagueId) => {
    const data = loadDatabase();
    return (data.sports_teams || []).filter(t => t.league_id === Number(leagueId));
  },

  // League Standings with Goal Difference & Automatic Points Calculation
  calculateLeagueStandings: (leagueId) => {
    const data = loadDatabase();
    const lId = Number(leagueId);
    const teams = (data.sports_teams || []).filter(t => t.league_id === lId);
    const leagueMatches = (data.matches || []).filter(m => m.league_id === lId && m.status === 'COMPLETED');

    // Reset stats
    teams.forEach(t => {
      t.played = 0;
      t.won = 0;
      t.drawn = 0;
      t.lost = 0;
      t.goals_for = 0;
      t.goals_against = 0;
      t.goal_difference = 0;
      t.points = 0;
    });

    leagueMatches.forEach(m => {
      const t1 = teams.find(t => t.name.toLowerCase() === m.player1.toLowerCase());
      const t2 = teams.find(t => t.name.toLowerCase() === m.player2.toLowerCase());

      const s1 = Number(m.player1_score) || 0;
      const s2 = Number(m.player2_score) || 0;

      if (t1 && t2) {
        t1.played += 1;
        t2.played += 1;
        t1.goals_for += s1;
        t1.goals_against += s2;
        t2.goals_for += s2;
        t2.goals_against += s1;

        if (s1 > s2) {
          t1.won += 1;
          t1.points += 3;
          t2.lost += 1;
        } else if (s2 > s1) {
          t2.won += 1;
          t2.points += 3;
          t1.lost += 1;
        } else {
          t1.drawn += 1;
          t2.drawn += 1;
          t1.points += 1;
          t2.points += 1;
        }

        t1.goal_difference = t1.goals_for - t1.goals_against;
        t2.goal_difference = t2.goals_for - t2.goals_against;
      }
    });

    // Sort by Points (descending) -> Goal Difference (descending) -> Goals For (descending)
    const sorted = [...teams].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });

    // Group by Pool
    const poolA = sorted.filter(t => t.pool === 'Pool A');
    const poolB = sorted.filter(t => t.pool === 'Pool B');

    saveDatabase();
    return { overall: sorted, poolA, poolB };
  },

  // Automatic Semifinal and Final Match Generation Based on Pool Standings
  generatePlayoffsMatches: (leagueId, scheduleDate = null) => {
    const data = loadDatabase();
    const lId = Number(leagueId);
    const standings = dbQueries.calculateLeagueStandings(lId);

    // Require top 2 from Pool A and top 2 from Pool B
    const topPoolA = standings.poolA.slice(0, 2);
    const topPoolB = standings.poolB.slice(0, 2);

    if (topPoolA.length < 2 || topPoolB.length < 2) {
      return {
        success: false,
        message: 'Need at least 2 ranked teams in each pool to auto-generate semifinals!'
      };
    }

    // Semi 1: 1st of Pool A vs 2nd of Pool B
    // Semi 2: 1st of Pool B vs 2nd of Pool A
    const sfDate = scheduleDate || new Date().toISOString().split('T')[0];

    // Check if semifinals already exist to prevent duplicate scheduling
    const existing = (data.matches || []).filter(m => m.league_id === lId && m.round_name.includes('Semifinal'));
    if (existing.length > 0) {
      return { success: false, message: 'Playoffs/Semifinals have already been generated for this league.' };
    }

    // 1. Create Final placeholder match first so next_match_id links properly
    const finalMatch = dbQueries.createMatch({
      league_id: lId,
      tournament_id: 0,
      round_name: 'Grand Final (State Championship)',
      bracket_pos: 'FINAL',
      player1: 'Winner Semifinal 1',
      player2: 'Winner Semifinal 2',
      status: 'SCHEDULED'
    });

    // 2. Semifinal 1
    const semi1 = dbQueries.createMatch({
      league_id: lId,
      tournament_id: 0,
      round_name: 'Semifinal 1 (Pool A #1 vs Pool B #2)',
      bracket_pos: 'SF-1',
      next_match_id: finalMatch.id,
      player1: topPoolA[0].name,
      player2: topPoolB[1].name,
      table_number: 'Ground / Court 1',
      status: 'SCHEDULED'
    });

    // 3. Semifinal 2
    const semi2 = dbQueries.createMatch({
      league_id: lId,
      tournament_id: 0,
      round_name: 'Semifinal 2 (Pool B #1 vs Pool A #2)',
      bracket_pos: 'SF-2',
      next_match_id: finalMatch.id,
      player1: topPoolB[0].name,
      player2: topPoolA[1].name,
      table_number: 'Ground / Court 2',
      status: 'SCHEDULED'
    });

    dbQueries.updateLeague(lId, { status: 'PLAYOFFS' });

    return {
      success: true,
      message: '✅ Semifinals and Grand Final created automatically with bracket linkage!',
      semi1,
      semi2,
      finalMatch
    };
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
