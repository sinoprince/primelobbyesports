// Prime Lobby Esports — Tournament Management Software Client Application

let currentToken = localStorage.getItem('ple_admin_token') || '';
let currentTab = 'tournaments';
let cachedTournaments = [];
let cachedPayments = [];
let tournamentFilter = 'all';
let paymentFilter = 'all';

let currentRole = localStorage.getItem('ple_user_role') || 'admin';
let currentUserName = localStorage.getItem('ple_user_name') || 'League Administrator';
let activeLeagueId = null;
let cachedLeagues = [];
let leagueMatchesFilter = 'all';

// Preset configurations matching user specifications
const PRESETS = {
  pubg_squad: {
    title: 'PUBG Mobile Squad Tournament',
    game: 'PUBG Mobile',
    mode: 'squad',
    max: 25,
    fee: '₹500 per Squad',
    prize: '1st: ₹3,000 | 2nd: ₹2,000 | 3rd: ₹1,000',
    rules: '3 Maps (Erangel, Miramar, Sanhok). Squad 4 players. Official BGMI / PUBG Esports points table applies.'
  },
  pubg_duo: {
    title: 'PUBG Mobile Duo Tournament',
    game: 'PUBG Mobile',
    mode: 'duo',
    max: 50,
    fee: '₹250 per Duo',
    prize: '1st: ₹3,000 | 2nd: ₹2,000 | 3rd: ₹1,000',
    rules: '3 Maps (Erangel, Miramar, Sanhok). Duo 2 players. Standard esports point distribution.'
  },
  valorant: {
    title: 'Valorant 5v5 Spike Series',
    game: 'Valorant',
    mode: '5v5',
    max: 15,
    fee: '₹1,000 per Team',
    prize: '1st: ₹5,000 | 2nd: ₹2,500',
    rules: 'Double elimination bracket. 2 matches guaranteed per team. Standard competitive overtime rules.'
  },
  freefire_squad: {
    title: 'Free Fire Squad Battle Royale',
    game: 'Free Fire',
    mode: 'squad',
    max: 12,
    fee: '₹500 per Squad',
    prize: '1st: ₹2,000 | 2nd: ₹1,000',
    rules: '3 Maps (Bermuda, Purgatory, Kalahari). Full squad registration required.'
  },
  freefire_duo: {
    title: 'Free Fire Duo Cup',
    game: 'Free Fire',
    mode: 'duo',
    max: 24,
    fee: '₹250 per Duo',
    prize: '1st: ₹2,000 | 2nd: ₹1,000',
    rules: '3 Maps. Duo format. Point system: 1 Kill = 1 Point, 1st = 12 Points.'
  },
  efootball: {
    title: 'eFootball 1v1 Open League',
    game: 'eFootball',
    mode: 'solo',
    max: 8,
    fee: '₹250 per Player',
    prize: '1st: ₹1,500 Instant Cash',
    rules: 'Single Elimination knockout. 10 Mins regular time, Extra Time & Penalties enabled.'
  }
};

// Initialize Application on load
document.addEventListener('DOMContentLoaded', () => {
  if (currentToken) {
    verifySession();
  } else {
    showLogin();
  }
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// Session Verification & Login
async function verifySession() {
  try {
    const res = await apiFetch('/api/stats');
    if (res && res.success) {
      showDashboard();
      initDashboard();
    } else {
      logout();
    }
  } catch (err) {
    logout();
  }
}

function showLogin() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('appContainer').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  const errorEl = document.getElementById('loginError');
  errorEl.classList.add('hidden');

  const pin = document.getElementById('adminPin').value.trim();
  if (!pin) {
    errorEl.innerText = 'Admin PIN is required.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success && data.token) {
      currentToken = data.token;
      currentRole = 'admin';
      currentUserName = 'Tournament Director';
      localStorage.setItem('ple_admin_token', currentToken);
      localStorage.setItem('ple_user_role', currentRole);
      localStorage.setItem('ple_user_name', currentUserName);

      showDashboard();
      initDashboard();
      showToast(data.message || 'Login successful', 'success');
    } else {
      errorEl.innerText = data.message || 'Invalid Admin Access Key.';
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    errorEl.innerText = 'Server connection failed. Ensure server is running.';
    errorEl.classList.remove('hidden');
  }
}

function logout() {
  currentToken = '';
  localStorage.removeItem('ple_admin_token');
  localStorage.removeItem('ple_user_role');
  localStorage.removeItem('ple_user_name');
  showLogin();
}

// API Fetch helper with Auth Header
async function apiFetch(endpoint, options = {}) {
  const headers = options.headers || {};
  headers['Authorization'] = `Bearer ${currentToken}`;
  headers['Content-Type'] = 'application/json';

  const res = await fetch(endpoint, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    showToast('Admin Session expired. Please re-enter PIN.', 'danger');
    logout();
    return null;
  }

  return await res.json();
}

// Initial Dashboard Setup
async function initDashboard() {
  // Update Role UI Indicator
  const roleDisplay = document.getElementById('currentRoleBadge');
  const userDisplay = document.getElementById('currentUserDisplay');
  if (roleDisplay) {
    if (currentRole === 'admin') roleDisplay.innerText = 'Director / Admin Mode';
    else if (currentRole === 'referee') roleDisplay.innerText = `Official Referee (${currentUserName})`;
    else if (currentRole === 'manager') roleDisplay.innerText = `Team Manager (${currentUserName})`;
  }
  if (userDisplay) {
    userDisplay.innerText = `● ${currentUserName} (${currentRole.toUpperCase()})`;
  }

  loadStats();
  loadChannels();
  loadLeagues();
  loadTournaments();
  // Poll stats every 30 seconds for live updates
  setInterval(loadStats, 30000);
}

// Tab Switching
function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const targetTabBtn = Array.from(document.querySelectorAll('.nav-tab')).find(b => b.getAttribute('onclick')?.includes(tabName));
  if (targetTabBtn) targetTabBtn.classList.add('active');

  const targetPane = document.getElementById(`tab-${tabName}`);
  if (targetPane) targetPane.classList.add('active');

  refreshCurrentTab();
}

function refreshCurrentTab() {
  loadStats();
  if (currentTab === 'leagues') {
    loadLeagues();
  } else if (currentTab === 'tournaments') {
    loadTournaments();
  } else if (currentTab === 'participants') {
    loadParticipantsTab();
  } else if (currentTab === 'payments') {
    loadPayments();
  } else if (currentTab === 'scoreboard') {
    loadScoreboardTab();
  } else if (currentTab === 'production') {
    loadProductionTab();
  } else if (currentTab === 'tickets') {
    loadTickets();
  } else if (currentTab === 'announcements') {
    loadChannels();
  }
}

// Load Top Stats Banner
async function loadStats() {
  const data = await apiFetch('/api/stats');
  if (!data || !data.success) return;
  const s = data.stats;
  document.getElementById('statActiveTourneys').innerText = s.activeTournaments;
  document.getElementById('statTotalTourneys').innerText = `${s.totalTournaments} Total Hosted`;
  document.getElementById('statConfirmedParticipants').innerText = s.confirmedParticipants;
  document.getElementById('statTotalParticipants').innerText = `${s.totalParticipants} Total Teams Registered`;
  document.getElementById('statPendingPayments').innerText = s.pendingPayments;
  document.getElementById('statApprovedPayments').innerText = `${s.approvedPayments} Approved Payments`;
  document.getElementById('statTotalRevenue').innerText = `₹${s.totalRevenue.toLocaleString('en-IN')}`;
}

// Channels loader for dropdown
async function loadChannels() {
  const data = await apiFetch('/api/channels');
  if (!data || !data.success) return;
  const select = document.getElementById('hostChannel');
  const announceSelect = document.getElementById('announceChannel');

  if (select) {
    select.innerHTML = '<option value="">Auto-Detect Default Game Registration Channel</option>';
    data.channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.innerText = `#${ch.name} ${ch.category ? `(${ch.category})` : ''}`;
      select.appendChild(opt);
    });
  }

  if (announceSelect) {
    announceSelect.innerHTML = '<option value="">Select Channel...</option>';
    data.channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.innerText = `#${ch.name} ${ch.category ? `(${ch.category})` : ''}`;
      announceSelect.appendChild(opt);
    });
  }
}

// --- TAB 1: Tournaments Management ---
async function loadTournaments() {
  const data = await apiFetch('/api/tournaments');
  if (!data || !data.success) return;
  cachedTournaments = data.tournaments;
  renderTournaments();
  populateTournamentDropdowns();
}

function filterTournaments(status) {
  tournamentFilter = status;
  document.querySelectorAll('#tab-tournaments .filter-pill').forEach(b => b.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('#tab-tournaments .filter-pill')).find(b => b.getAttribute('onclick')?.includes(`'${status}'`));
  if (btn) btn.classList.add('active');
  renderTournaments();
}

function renderTournaments() {
  const container = document.getElementById('tournamentsList');
  if (!container) return;

  const filtered = cachedTournaments.filter(t => {
    if (tournamentFilter === 'all') return true;
    if (tournamentFilter === 'STARTED') return t.status === 'STARTED' || t.status === 'ACTIVE';
    return t.status === tournamentFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No tournaments found with status: <strong>${tournamentFilter}</strong></div>`;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const confirmed = (t.participants || []).filter(p => p.slotStatus === 'CONFIRMED' || p.paid).length;
    const reserved = (t.participants || []).filter(p => p.slotStatus === 'RESERVED' && !p.paid).length;
    const totalBooked = confirmed + reserved;
    const balance = Math.max(0, (t.maxSlots || t.maxParticipants) - totalBooked);
    const badgeClass = (t.status === 'OPEN') ? 'badge-open' : ((t.status === 'STARTED' || t.status === 'ACTIVE') ? 'badge-started' : 'badge-completed');

    return `
      <div class="tourney-card">
        <div class="card-header">
          <div>
            <span class="game-tag">${escapeHtml(t.game)} • ${escapeHtml((t.formatMode || t.mode || '').toUpperCase())}</span>
            <h3 class="card-title">${escapeHtml(t.name || t.title)}</h3>
          </div>
          <span class="badge ${badgeClass}">${t.status}</span>
        </div>

        <div class="card-meta">
          <div>💵 <strong>Entry Fee:</strong> ${escapeHtml(t.entryFee || 'Free')}</div>
          <div>🏆 <strong>Prize Pool:</strong> ${escapeHtml(t.prizePool || 'Glory')}</div>
          <div>📢 <strong>Discord Channel:</strong> <span class="text-info">${t.channelId ? `<#${t.channelId}>` : 'Auto / General'}</span></div>
        </div>

        <div class="slot-meter">
          <div class="slot-meter-header">
            <span>Slots: <strong>${confirmed}/${t.maxSlots || t.maxParticipants} Confirmed</strong></span>
            <span class="${balance === 0 ? 'text-danger' : 'text-success'}"><strong>${balance} Balance Slots Left</strong></span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${Math.min(100, (totalBooked / (t.maxSlots || t.maxParticipants)) * 100)}%"></div>
          </div>
          ${reserved > 0 ? `<small class="text-warning">⏳ ${reserved} team(s) awaiting payment verification</small>` : ''}
        </div>

        <div class="card-actions">
          ${t.status === 'OPEN' ? `
            <button class="btn btn-sm btn-info" onclick="openAddTeamModal('${t.id}')">➕ Add Team</button>
            <button class="btn btn-sm btn-primary" onclick="openRoomModal('${t.id}')">🔐 Room ID/Pass</button>
            <button class="btn btn-sm btn-success" onclick="startTournament('${t.id}')">⚔️ Start Tournament</button>
            <button class="btn btn-sm btn-danger-outline" onclick="openCloseTourneyModal('${t.id}')">🏁 Close</button>
          ` : ((t.status === 'STARTED' || t.status === 'ACTIVE') ? `
            <button class="btn btn-sm btn-info" onclick="openAddTeamModal('${t.id}')">➕ Add Team</button>
            <button class="btn btn-sm btn-primary" onclick="openRoomModal('${t.id}')">🔐 Room ID/Pass</button>
            <button class="btn btn-sm btn-success" onclick="switchTab('scoreboard')">📊 Update Scores</button>
            <button class="btn btn-sm btn-danger-outline" onclick="openCloseTourneyModal('${t.id}')">🏁 Conclude</button>
          ` : `
            <span class="text-muted text-sm">🏆 Concluded: ${escapeHtml(t.winner || 'Completed')}</span>
          `)}
          <button class="btn btn-sm btn-outline" onclick="viewParticipantsForTourney('${t.id}')">👥 View Teams (${t.participants ? t.participants.length : 0})</button>
        </div>
      </div>
    `;
  }).join('');
}

function viewParticipantsForTourney(tourneyId) {
  switchTab('participants');
  const sel = document.getElementById('participantTourneySelect');
  if (sel) {
    sel.value = tourneyId;
    loadParticipantsForSelected();
  }
}

// Host Tournament Modal & Presets
function openHostModal() {
  document.getElementById('hostModal').classList.remove('hidden');
}

function closeHostModal() {
  document.getElementById('hostModal').classList.add('hidden');
}

function applyPreset(presetKey) {
  const p = PRESETS[presetKey];
  if (!p) return;
  document.getElementById('hostTitle').value = p.title;
  document.getElementById('hostGame').value = p.game;
  document.getElementById('hostMode').value = p.mode;
  document.getElementById('hostMax').value = p.max;
  document.getElementById('hostFee').value = p.fee;
  document.getElementById('hostPrize').value = p.prize;
  document.getElementById('hostRules').value = p.rules;
}

function handleGameSelectChange() {
  const game = document.getElementById('hostGame').value;
  if (game === 'PUBG Mobile') {
    applyPreset('pubg_squad');
  } else if (game === 'Valorant') {
    applyPreset('valorant');
  } else if (game === 'Free Fire') {
    applyPreset('freefire_squad');
  } else if (game === 'eFootball') {
    applyPreset('efootball');
  }
}

async function handleHostTournament(e) {
  e.preventDefault();
  const btn = document.getElementById('btnHostSubmit');
  btn.disabled = true;
  btn.innerText = '⏳ Deploying to Discord...';

  const payload = {
    title: document.getElementById('hostTitle').value.trim(),
    game: document.getElementById('hostGame').value,
    formatMode: document.getElementById('hostMode').value,
    maxSlots: parseInt(document.getElementById('hostMax').value, 10),
    entryFee: document.getElementById('hostFee').value.trim(),
    prizePool: document.getElementById('hostPrize').value.trim(),
    rules: document.getElementById('hostRules').value.trim(),
    schedule_date: document.getElementById('hostScheduleDate')?.value || null,
    schedule_time: document.getElementById('hostScheduleTime')?.value || null,
    rounds: document.getElementById('hostRounds')?.value.trim() || null,
    maps: document.getElementById('hostMaps')?.value.trim() || null,
    channelId: document.getElementById('hostChannel').value || null
  };

  try {
    const res = await apiFetch('/api/tournaments/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res && res.success) {
      showToast(`Tournament "${payload.title}" deployed & broadcasted to Discord!`, 'success');
      closeHostModal();
      document.getElementById('hostForm').reset();
      loadTournaments();
      loadStats();
    } else {
      showToast(res ? res.error : 'Failed to host tournament', 'danger');
    }
  } catch (err) {
    showToast('Failed to deploy tournament: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '🚀 Deploy to Discord';
  }
}

// Start Tournament Action
async function startTournament(tourneyId) {
  if (!confirm('Are you sure you want to start this tournament? This will close registrations and notify all participants on Discord!')) return;
  const res = await apiFetch(`/api/tournaments/${tourneyId}/start`, { method: 'POST' });
  if (res && res.success) {
    showToast('Tournament started & match announcement broadcasted!', 'success');
    loadTournaments();
    loadStats();
  } else {
    showToast(res ? res.error : 'Failed to start tournament', 'danger');
  }
}

// Close Tournament Modal & Action
function openCloseTourneyModal(tourneyId) {
  document.getElementById('closeTourneyId').value = tourneyId;
  document.getElementById('closeTourneyModal').classList.remove('hidden');
}

function closeCloseTourneyModal() {
  document.getElementById('closeTourneyModal').classList.add('hidden');
  document.getElementById('closeTourneyForm').reset();
}

async function handleCloseTournament(e) {
  e.preventDefault();
  const tourneyId = document.getElementById('closeTourneyId').value;
  const winner = document.getElementById('closeWinner').value.trim();
  const deleteChannels = document.getElementById('closeDeleteChannels').checked;

  const res = await apiFetch(`/api/tournaments/${tourneyId}/close`, {
    method: 'POST',
    body: JSON.stringify({ winner, deleteChannels })
  });

  if (res && res.success) {
    showToast('Tournament closed & podium standings announced on Discord!', 'success');
    closeCloseTourneyModal();
    loadTournaments();
    loadStats();
  } else {
    showToast(res ? res.error : 'Failed to close tournament', 'danger');
  }
}

// --- TAB 2: Participants & Slot Balance Hub ---
function populateTournamentDropdowns() {
  const partSelect = document.getElementById('participantTourneySelect');
  const scoreSelect = document.getElementById('scoreTourneySelect');
  const addTeamSelect = document.getElementById('addTeamTourneySelect');
  if (!partSelect || !scoreSelect) return;

  const currentPartVal = partSelect.value;
  const currentScoreVal = scoreSelect.value;
  const currentAddVal = addTeamSelect ? addTeamSelect.value : '';

  const optionsHtml = '<option value="">Select Tournament...</option>' + cachedTournaments.map(t => {
    return `<option value="${t.id}">[${t.status}] ${escapeHtml(t.name || t.title)} (${escapeHtml(t.game)})</option>`;
  }).join('');

  partSelect.innerHTML = optionsHtml;
  scoreSelect.innerHTML = optionsHtml;
  if (addTeamSelect) addTeamSelect.innerHTML = optionsHtml;

  if (currentPartVal) partSelect.value = currentPartVal;
  if (currentScoreVal) scoreSelect.value = currentScoreVal;
  if (currentAddVal && addTeamSelect) addTeamSelect.value = currentAddVal;
}

function loadParticipantsTab() {
  populateTournamentDropdowns();
  loadParticipantsForSelected();
}

async function loadParticipantsForSelected() {
  const select = document.getElementById('participantTourneySelect');
  const tbody = document.getElementById('participantsTableBody');
  const banner = document.getElementById('slotBalanceBanner');
  if (!select || !tbody) return;

  const tourneyId = select.value;
  if (!tourneyId) {
    banner.classList.add('hidden');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Select a tournament above to view registered teams.</td></tr>';
    return;
  }

  const data = await apiFetch(`/api/tournaments/${tourneyId}/participants`);
  if (!data || !data.success) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load participants.</td></tr>';
    return;
  }

  const tourney = data.tournament;
  const parts = data.participants || [];

  // Slot balance calculation
  const confirmedCount = parts.filter(p => p.slotStatus === 'CONFIRMED' || p.paid).length;
  const reservedCount = parts.filter(p => p.slotStatus === 'RESERVED' && !p.paid).length;
  const max = tourney.maxSlots || tourney.maxParticipants || 0;
  const balance = Math.max(0, max - (confirmedCount + reservedCount));

  banner.innerHTML = `
    <div class="slot-banner-item">
      <span>Tournament Format:</span>
      <strong>${escapeHtml(tourney.game)} (${escapeHtml((tourney.formatMode || tourney.mode || '').toUpperCase())})</strong>
    </div>
    <div class="slot-banner-item">
      <span>Max Capacity:</span>
      <strong>${max} Teams / Slots</strong>
    </div>
    <div class="slot-banner-item">
      <span>Confirmed & Paid:</span>
      <strong class="text-success">${confirmedCount} Teams</strong>
    </div>
    <div class="slot-banner-item">
      <span>Awaiting Payment:</span>
      <strong class="text-warning">${reservedCount} Teams</strong>
    </div>
    <div class="slot-banner-item">
      <span>Balance Available:</span>
      <strong class="${balance === 0 ? 'text-danger' : 'text-info'}">${balance} Teams Can Still Join</strong>
    </div>
  `;
  banner.classList.remove('hidden');

  if (parts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No teams registered for this tournament yet.</td></tr>';
    return;
  }

  tbody.innerHTML = parts.map((p, idx) => {
    const isPaid = p.paid || p.slotStatus === 'CONFIRMED';

    return `
      <tr>
        <td><strong>#${idx + 1}</strong></td>
        <td><strong>${escapeHtml(p.teamName || 'Solo Player')}</strong></td>
        <td><code>${escapeHtml(p.ign || p.inGameId || 'N/A')}</code></td>
        <td>${escapeHtml(p.username || p.tag || p.userId)}</td>
        <td>
          <select class="status-badge-select ${isPaid ? 'badge-confirmed' : 'badge-reserved'}" onchange="changeParticipantStatus('${tourney.id}', '${p.userId}', this.value)" title="Click to Change Slot Booking / Payment Status">
            <option value="CONFIRMED" ${isPaid ? 'selected' : ''}>✅ CONFIRMED</option>
            <option value="PENDING" ${!isPaid ? 'selected' : ''}>⏳ RESERVED (UNPAID)</option>
          </select>
        </td>
        <td>${new Date(p.registeredAt || Date.now()).toLocaleString()}</td>
        <td>
          <div class="action-btn-group">
            ${!isPaid ? `
              <button class="btn btn-xs btn-success" onclick="changeParticipantStatus('${tourney.id}', '${p.userId}', 'CONFIRMED')" title="Approve & Confirm Slot">✅ Confirm Slot</button>
            ` : `
              <button class="btn btn-xs btn-warning" onclick="changeParticipantStatus('${tourney.id}', '${p.userId}', 'PENDING')" title="Revert back to Unpaid">⏳ Revert to Unpaid</button>
            `}
            <button class="btn btn-xs btn-danger-outline" onclick="removeParticipant('${tourney.id}', '${p.userId}')" title="Kick participant and release slot back">❌ Kick</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function changeParticipantStatus(tourneyId, userId, newStatus) {
  try {
    const res = await apiFetch(`/api/tournaments/${tourneyId}/update-participant-status`, {
      method: 'POST',
      body: JSON.stringify({ userId, status: newStatus })
    });

    if (res && res.success) {
      showToast(res.message || `Status updated to ${newStatus}!`, 'success');
      loadParticipantsForSelected();
      loadTournaments();
      loadStats();
    } else {
      showToast(res ? (res.message || res.error) : 'Failed to update status', 'danger');
      loadParticipantsForSelected();
    }
  } catch (err) {
    showToast('Failed to update participant status: ' + err.message, 'danger');
    loadParticipantsForSelected();
  }
}

async function removeParticipant(tourneyId, userId) {
  if (!confirm('Are you sure you want to remove this participant? Their slot will be released back to the tournament.')) return;
  const res = await apiFetch(`/api/tournaments/${tourneyId}/remove-participant`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });

  if (res && res.success) {
    showToast('Participant removed and slot released!', 'success');
    loadParticipantsForSelected();
    loadTournaments();
    loadStats();
  } else {
    showToast(res ? res.error : 'Failed to remove participant', 'danger');
  }
}

// Add Team Modal Controls
function openAddTeamModal(tourneyId = null) {
  const modal = document.getElementById('addTeamModal');
  const select = document.getElementById('addTeamTourneySelect');
  populateTournamentDropdowns();

  if (tourneyId && select) {
    select.value = tourneyId;
  } else if (select && document.getElementById('participantTourneySelect')?.value) {
    select.value = document.getElementById('participantTourneySelect').value;
  }

  if (modal) modal.classList.remove('hidden');
}

function closeAddTeamModal() {
  const modal = document.getElementById('addTeamModal');
  if (modal) modal.classList.add('hidden');
  const form = document.getElementById('addTeamForm');
  if (form) form.reset();
}

async function handleAddTeamSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnAddTeamSubmit');
  const tourneyId = document.getElementById('addTeamTourneySelect').value;

  if (!tourneyId) {
    showToast('Please select a target tournament.', 'danger');
    return;
  }

  const teamName = document.getElementById('addTeamName').value.trim();
  const ign = document.getElementById('addTeamIgn').value.trim();
  const userId = document.getElementById('addTeamUser').value.trim();
  const slotStatus = document.getElementById('addTeamStatus').value;
  const utr = document.getElementById('addTeamUtr').value.trim();

  if (!teamName || !ign) {
    showToast('Team Name and In-Game ID / IGN are required.', 'danger');
    return;
  }

  btn.disabled = true;
  btn.innerText = '⏳ Registering Team...';

  try {
    const res = await apiFetch(`/api/tournaments/${tourneyId}/add-participant`, {
      method: 'POST',
      body: JSON.stringify({
        teamName,
        ign,
        userId: userId || null,
        slotStatus,
        utr: utr || 'Manual Admin Registration'
      })
    });

    if (res && res.success) {
      showToast(res.message || `Team "${teamName}" registered successfully!`, 'success');
      closeAddTeamModal();

      // Ensure participant dropdown selects this tournament
      const partSelect = document.getElementById('participantTourneySelect');
      if (partSelect) {
        partSelect.value = tourneyId;
      }

      loadTournaments();
      loadStats();
      if (currentTab === 'participants') {
        loadParticipantsForSelected();
      }
    } else {
      showToast(res ? (res.message || res.error) : 'Failed to register team', 'danger');
    }
  } catch (err) {
    showToast('Error registering team: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '💾 Register Team & Update Discord';
  }
}

// --- TAB 3: Payment Verification & Ledger Hub ---
async function loadPayments() {
  const data = await apiFetch('/api/payments');
  if (!data || !data.success) return;
  cachedPayments = data.payments || [];
  renderPayments();
}

function filterPayments(status) {
  paymentFilter = status;
  document.querySelectorAll('#tab-payments .filter-pill').forEach(b => b.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('#tab-payments .filter-pill')).find(b => b.getAttribute('onclick')?.includes(`'${status}'`));
  if (btn) btn.classList.add('active');
  renderPayments();
}

function renderPayments() {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;

  const filtered = cachedPayments.filter(p => {
    if (paymentFilter === 'all') return true;
    return (p.status || '').toUpperCase() === paymentFilter.toUpperCase();
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No payments found with status: <strong>${paymentFilter}</strong></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const isPending = (p.status || '').toUpperCase() === 'PENDING';
    const isApproved = (p.status || '').toUpperCase() === 'APPROVED';
    const isRejected = (p.status || '').toUpperCase() === 'REJECTED';

    let badgeClass = 'badge-secondary';
    if (isPending) badgeClass = 'badge-warning';
    if (isApproved) badgeClass = 'badge-success';
    if (isRejected) badgeClass = 'badge-danger';

    const hasProof = p.screenshotUrl || p.proofUrl;

    return `
      <tr>
        <td><code>${escapeHtml(p.id)}</code></td>
        <td>
          <strong>${escapeHtml(p.username || p.tag || 'User')}</strong><br>
          <small class="text-muted">${p.userId}</small>
        </td>
        <td>
          <strong>${escapeHtml(p.teamName || 'Solo')}</strong><br>
          <small class="text-info">${escapeHtml(p.ign || '')}</small>
        </td>
        <td><strong class="text-success">${p.amount ? `₹${p.amount}` : '₹' + (p.entryFee || '250')}</strong></td>
        <td>${escapeHtml(p.purpose || p.tournamentTitle || 'Tournament Entry')}</td>
        <td>
          <span class="utr-tag">${escapeHtml(p.utr || p.transactionId || 'None')}</span>
        </td>
        <td>
          ${hasProof ? `
            <button class="btn btn-xs btn-outline" onclick="openScreenshotModal('${escapeHtml(p.screenshotUrl || p.proofUrl)}')">🖼️ View Proof</button>
          ` : '<span class="text-muted">No Image</span>'}
        </td>
        <td><span class="badge ${badgeClass}">${p.status || 'PENDING'}</span></td>
        <td>
          <div class="action-btn-group">
            ${isPending ? `
              <button class="btn btn-xs btn-success" onclick="approvePayment('${p.id}')" title="Approve Payment & Book Slot">✅ Approve</button>
              <button class="btn btn-xs btn-danger" onclick="rejectPayment('${p.id}')" title="Reject Payment & Release Slot">❌ Reject</button>
              <button class="btn btn-xs btn-outline" onclick="requestProof('${p.id}')" title="DM player requesting clear screenshot">📸 Request Proof</button>
            ` : `
              <span class="text-muted text-sm">${isApproved ? 'Verified & Invoiced' : 'Payment Closed'}</span>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function approvePayment(id) {
  if (!confirm('Approve this payment? This will confirm the team slot, grant Discord participant role, and send an official invoice DM via PLE Payments bot.')) return;
  const res = await apiFetch(`/api/payments/${id}/approve`, { method: 'POST' });
  if (res && res.success) {
    showToast('Payment APPROVED! Slot booked and invoice sent to player.', 'success');
    loadPayments();
    loadStats();
    loadTournaments();
  } else {
    showToast(res ? res.error : 'Failed to approve payment', 'danger');
  }
}

async function rejectPayment(id) {
  const reason = prompt('Enter rejection reason (will be sent in DM to player):', 'Invalid UTR or payment proof not verified.');
  if (reason === null) return;

  const res = await apiFetch(`/api/payments/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  });

  if (res && res.success) {
    showToast('Payment REJECTED! Slot released back to tournament pool and player notified.', 'warning');
    loadPayments();
    loadStats();
    loadTournaments();
  } else {
    showToast(res ? res.error : 'Failed to reject payment', 'danger');
  }
}

async function requestProof(id) {
  const res = await apiFetch(`/api/payments/${id}/request-proof`, { method: 'POST' });
  if (res && res.success) {
    showToast('Screenshot proof request sent to user via Discord DM!', 'info');
  } else {
    showToast(res ? res.error : 'Failed to request proof', 'danger');
  }
}

// Screenshot modal
function openScreenshotModal(url) {
  const img = document.getElementById('previewImage');
  img.src = url;
  document.getElementById('screenshotModal').classList.remove('hidden');
}

function closeScreenshotModal() {
  document.getElementById('screenshotModal').classList.add('hidden');
  document.getElementById('previewImage').src = '';
}

// --- TAB 4: Esports Scoreboard Manager ---
let cachedScoreboardEntries = [];

function loadScoreboardTab() {
  populateTournamentDropdowns();
  const select = document.getElementById('scoreTourneySelect');
  if (select && select.value) {
    handleScoreTourneyChange();
  } else if (select && select.options.length > 1) {
    select.selectedIndex = 1;
    handleScoreTourneyChange();
  }
}

async function handleScoreTourneyChange() {
  const tourneyId = document.getElementById('scoreTourneySelect').value;
  const banner = document.getElementById('scoreTourneyBanner');
  const feed = document.getElementById('scoreboardEntriesList');
  const countBadge = document.getElementById('scoreEntriesCount');
  const teamDatalist = document.getElementById('teamNamesList');
  const quickPickRow = document.getElementById('quickWinnerButtons');

  if (!tourneyId) {
    if (banner) banner.classList.add('hidden');
    if (feed) feed.innerHTML = '<div class="empty-state" style="padding: 30px;">Select a tournament above to inspect recorded fixtures and live leaderboard standings.</div>';
    if (countBadge) countBadge.innerText = '0 Matches';
    if (quickPickRow) quickPickRow.classList.add('hidden');
    return;
  }

  // Fetch Tournament Scoreboard & Participants
  const [scoreData, partData] = await Promise.all([
    apiFetch(`/api/tournaments/${tourneyId}/scoreboard`),
    apiFetch(`/api/tournaments/${tourneyId}/participants`)
  ]);

  const tourney = (scoreData && scoreData.tournament) || cachedTournaments.find(t => String(t.id) === String(tourneyId));
  const entries = (scoreData && scoreData.entries) || [];
  cachedScoreboardEntries = entries;
  const participants = (partData && partData.participants) || [];

  // Update Overview Banner
  if (banner && tourney) {
    banner.classList.remove('hidden');
    document.getElementById('scoreTourneyGame').innerText = tourney.game || 'Esports';
    document.getElementById('scoreTourneyTitle').innerText = tourney.title || tourney.name || `Tournament #${tourneyId}`;
    document.getElementById('scoreTourneyMeta').innerText = `Format: ${(tourney.formatMode || tourney.mode || 'Custom').toUpperCase()} • Channel: #${tourney.channel_id || tourney.dashboard_channel_id || 'active-tournaments'}`;
    document.getElementById('scoreStatMatches').innerText = entries.length;
    document.getElementById('scoreStatTeams').innerText = participants.length;
  }

  // Update Matches Count Badge
  if (countBadge) {
    countBadge.innerText = `${entries.length} ${entries.length === 1 ? 'Match' : 'Matches'}`;
  }

  // Populate Teams Datalist for fast autocomplete
  if (teamDatalist) {
    const teamOptions = participants.map(p => {
      const name = p.teamName || p.squad_name || p.username || p.ign;
      return `<option value="${escapeHtml(name)}">${escapeHtml(name)} (IGN: ${escapeHtml(p.ign || 'N/A')})</option>`;
    }).join('');
    teamDatalist.innerHTML = teamOptions;
  }

  // Hook input listeners for Quick Winner selector
  setupQuickWinnerListeners();

  // Render Logged Matches Feed
  renderScoreboardEntries(entries, tourneyId);

  // Load Matches & Pending Self-Report Submissions for TD
  loadMatchesAndPendingApprovals(tourneyId);
}

function setupQuickWinnerListeners() {
  const p1Input = document.getElementById('scoreP1');
  const p2Input = document.getElementById('scoreP2');
  const quickRow = document.getElementById('quickWinnerButtons');
  const btnP1 = document.getElementById('btnPickP1');
  const btnP2 = document.getElementById('btnPickP2');

  function updateQuickPicks() {
    const val1 = p1Input.value.trim();
    const val2 = p2Input.value.trim();

    if (val1 || val2) {
      quickRow.classList.remove('hidden');
      if (val1) {
        btnP1.innerText = `🏆 ${val1}`;
        btnP1.style.display = 'inline-block';
      } else {
        btnP1.style.display = 'none';
      }

      if (val2 && val2 !== 'N/A') {
        btnP2.innerText = `🏆 ${val2}`;
        btnP2.style.display = 'inline-block';
      } else {
        btnP2.style.display = 'none';
      }
    } else {
      quickRow.classList.add('hidden');
    }
  }

  p1Input.oninput = updateQuickPicks;
  p2Input.oninput = updateQuickPicks;
}

function setWinnerFromP1() {
  const p1 = document.getElementById('scoreP1').value.trim();
  if (p1) document.getElementById('scoreWinner').value = p1;
}

function setWinnerFromP2() {
  const p2 = document.getElementById('scoreP2').value.trim();
  if (p2) document.getElementById('scoreWinner').value = p2;
}

function applyScorePreset(presetName) {
  const roundInput = document.getElementById('scoreRound');
  if (roundInput) {
    roundInput.value = presetName;
    roundInput.focus();
  }
}

function renderScoreboardEntries(entries, tourneyId) {
  const feed = document.getElementById('scoreboardEntriesList');
  if (!feed) return;

  if (!entries || entries.length === 0) {
    feed.innerHTML = `
      <div class="empty-state" style="padding: 30px;">
        <span style="font-size: 2rem; display: block; margin-bottom: 8px;">⚔️</span>
        No matches recorded yet for this tournament.<br>
        <span class="text-muted text-sm">Use the form on the left to broadcast your first round result to Discord.</span>
      </div>
    `;
    return;
  }

  const reversed = [...entries].reverse();
  feed.innerHTML = reversed.map((m, idx) => {
    const timeFormatted = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live';
    const isSingleParticipant = !m.player2 || m.player2 === 'N/A' || m.player2 === '';

    return `
      <div class="score-match-card">
        <div class="score-match-header">
          <span class="score-round-title">📌 ${escapeHtml(m.round_name)}</span>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="text-muted text-sm">${timeFormatted}</span>
            <button class="btn-delete-match" onclick="handleDeleteScoreEntry('${tourneyId}', '${m.id}')" title="Delete record & refresh Discord">✕ Delete</button>
          </div>
        </div>

        <div class="score-match-body">
          <div class="score-vs-teams">
            ${isSingleParticipant ? `
              <span class="text-info">${escapeHtml(m.player1)}</span>
            ` : `
              <span class="${m.winner === m.player1 ? 'text-success' : ''}">${escapeHtml(m.player1)}</span>
              <span class="text-muted" style="margin: 0 6px; font-weight: normal;">vs</span>
              <span class="${m.winner === m.player2 ? 'text-success' : ''}">${escapeHtml(m.player2)}</span>
            `}
          </div>
          <span class="score-badge-result">${escapeHtml(m.score)}</span>
        </div>

        ${(m.kills !== undefined && m.kills !== null) || m.kda || m.efootball_id || m.proof_url ? `
          <div style="font-size: 0.8rem; padding: 4px 0; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap; border-top: 1px dashed rgba(255,255,255,0.08); margin-top: 4px;">
            ${(m.kills !== undefined && m.kills !== null) ? `<span style="color: #FF5252;">💥 <strong>${m.kills}</strong> Kills</span>` : ''}
            ${m.kda ? `<span style="color: #00B0FF;">🎯 KDA: <strong>${escapeHtml(m.kda)}</strong></span>` : ''}
            ${m.efootball_id ? `<span style="color: #FFAB00;">⚽ Room: <strong>${escapeHtml(m.efootball_id)}</strong></span>` : ''}
            ${m.proof_url ? `<a href="${escapeHtml(m.proof_url)}" target="_blank" style="color: #00E676; text-decoration: underline;">📸 View Screenshot Proof</a>` : ''}
          </div>
        ` : ''}

        <div class="score-match-winner">
          <span>🏆 <strong>Winner / Top:</strong> ${escapeHtml(m.winner || m.player1)}</span>
          <span class="text-muted text-sm">Discord Synced ●</span>
        </div>
      </div>
    `;
  }).join('');
}

async function handleDeleteScoreEntry(tourneyId, entryId) {
  if (!confirm('Are you sure you want to delete this match record? This will also update the Discord live scoreboard.')) {
    return;
  }

  const res = await apiFetch(`/api/tournaments/${tourneyId}/score/${entryId}`, {
    method: 'DELETE'
  });

  if (res && res.success) {
    showToast('Match record deleted & live Discord scoreboard updated!', 'success');
    handleScoreTourneyChange();
  } else {
    showToast(res ? res.message : 'Failed to delete score entry', 'danger');
  }
}

let isEfootballLocked = false;

function toggleEfootballLock() {
  isEfootballLocked = !isEfootballLocked;
  const idInput = document.getElementById('efootballRoomId');
  const passInput = document.getElementById('efootballRoomPass');
  const badge = document.getElementById('efootballLockBadge');
  const btn = document.getElementById('btnToggleLockEfootball');

  if (isEfootballLocked) {
    if (idInput) idInput.readOnly = true;
    if (passInput) passInput.readOnly = true;
    if (badge) {
      badge.innerText = '🔒 Locked for Round';
      badge.style.background = 'rgba(255, 171, 0, 0.2)';
      badge.style.color = '#FFAB00';
    }
    if (btn) btn.innerText = '🔓 Unlock Entry';
    showToast('eFootball room credentials locked for this round.', 'info');
  } else {
    if (idInput) idInput.readOnly = false;
    if (passInput) passInput.readOnly = false;
    if (badge) {
      badge.innerText = 'Unlocked';
      badge.style.background = 'rgba(255, 255, 255, 0.1)';
      badge.style.color = 'var(--text-muted)';
    }
    if (btn) btn.innerText = '🔒 Lock Entry';
  }
}

async function handleProofFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const preview = document.getElementById('scoreProofPreview');
  const container = document.getElementById('scoreProofPreviewContainer');
  const status = document.getElementById('scoreProofStatus');

  const reader = new FileReader();
  reader.onload = async function(event) {
    const base64Data = event.target.result;
    if (preview) preview.src = base64Data;
    if (container) container.classList.remove('hidden');
    if (status) status.innerText = '⏳ Uploading screenshot...';

    // Upload to server
    const res = await apiFetch('/api/upload/screenshot', {
      method: 'POST',
      body: JSON.stringify({ imageBase64: base64Data, filename: file.name })
    });

    if (res && res.success && res.url) {
      document.getElementById('scoreProofUrl').value = res.url;
      if (status) status.innerText = '✅ Screenshot verified & uploaded';
      showToast('Screenshot uploaded successfully', 'success');
    } else {
      if (status) status.innerText = '❌ Upload failed';
      showToast('Screenshot upload failed', 'danger');
    }
  };
  reader.readAsDataURL(file);
}

async function handleScoreSubmit(e) {
  e.preventDefault();
  const tourneyId = document.getElementById('scoreTourneySelect').value;
  if (!tourneyId) {
    showToast('Please select a tournament from the dropdown', 'warning');
    return;
  }

  const btn = document.getElementById('btnSubmitScore');
  btn.disabled = true;
  btn.innerText = '⏳ Syncing to Discord #📊-scoreboard...';

  const killsVal = document.getElementById('scoreKills')?.value;
  const kdaVal = document.getElementById('scoreKda')?.value.trim();
  const proofUrlVal = document.getElementById('scoreProofUrl')?.value.trim();
  const efootballIdVal = document.getElementById('efootballRoomId')?.value.trim();
  const efootballPassVal = document.getElementById('efootballRoomPass')?.value.trim();

  const payload = {
    round: document.getElementById('scoreRound').value.trim(),
    p1: document.getElementById('scoreP1').value.trim(),
    p2: document.getElementById('scoreP2').value.trim() || 'N/A',
    result: document.getElementById('scoreResult').value.trim(),
    winner: document.getElementById('scoreWinner').value.trim(),
    kills: killsVal !== '' && killsVal !== undefined ? parseInt(killsVal, 10) : null,
    kda: kdaVal || null,
    proofUrl: proofUrlVal || null,
    efootballId: efootballIdVal || null,
    efootballPass: efootballPassVal || null
  };

  try {
    const res = await apiFetch(`/api/tournaments/${tourneyId}/score`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res && res.success) {
      showToast('Match result, metrics & proof submitted to Discord #📊-scoreboard!', 'success');
      document.getElementById('scoreRound').value = '';
      document.getElementById('scoreResult').value = '';
      if (document.getElementById('scoreKills')) document.getElementById('scoreKills').value = '';
      if (document.getElementById('scoreKda')) document.getElementById('scoreKda').value = '';
      document.getElementById('scoreProofFile').value = '';
      document.getElementById('scoreProofUrl').value = '';
      document.getElementById('scoreProofPreviewContainer').classList.add('hidden');

      // Auto-lock eFootball credentials after entry for each round
      if (efootballIdVal && !isEfootballLocked) {
        toggleEfootballLock();
      }

      handleScoreTourneyChange();
    } else {
      showToast(res ? res.message || res.error : 'Failed to broadcast scoreboard', 'danger');
    }
  } catch (err) {
    showToast('Network error updating scoreboard', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '📢 Broadcast Score & Metrics to Discord #📊-scoreboard';
  }
}

// --- TAB 5: Support Tickets ---
async function loadTickets() {
  const data = await apiFetch('/api/tickets');
  const tbody = document.getElementById('ticketsTableBody');
  if (!tbody) return;

  if (!data || !data.success || !data.tickets || data.tickets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No open support tickets at this time.</td></tr>';
    return;
  }

  // Place active tickets at the very top
  const sortedTickets = [...data.tickets].sort((a, b) => {
    const aClosed = (a.status === 'CLOSED');
    const bClosed = (b.status === 'CLOSED');
    if (!aClosed && bClosed) return -1;
    if (aClosed && !bClosed) return 1;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  tbody.innerHTML = sortedTickets.map(t => {
    const isClosed = t.status === 'CLOSED';
    return `
      <tr style="${!isClosed ? 'background: rgba(0, 230, 118, 0.05); font-weight: 500;' : 'opacity: 0.75;'}">
        <td><code>#${escapeHtml(t.id || t.channelId)}</code></td>
        <td><span class="badge badge-info">${escapeHtml(t.category || 'General Support')}</span></td>
        <td><strong>${escapeHtml(t.username || t.tag || t.userId)}</strong></td>
        <td><span class="badge ${isClosed ? 'badge-secondary' : 'badge-success'}">${t.status || 'OPEN'}</span></td>
        <td>${t.claimedBy ? escapeHtml(t.claimedBy) : '<span class="text-warning">⚠️ Unclaimed</span>'}</td>
        <td>${new Date(t.createdAt || Date.now()).toLocaleString()}</td>
      </tr>
    `;
  }).join('');
}

// Helper: Escape HTML to prevent injection
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Live Discord Embed Preview Updater
function updateAnnouncementPreview() {
  const title = document.getElementById('announceTitle')?.value.trim() || 'Title Preview';
  const msg = document.getElementById('announceMessage')?.value.trim() || 'Announcement text will be rendered live here as you type...';
  const color = document.getElementById('announceColor')?.value || '#FFA500';
  const ping = document.getElementById('announcePing')?.value;
  const imgUrl = document.getElementById('announceImage')?.value.trim();

  const previewCard = document.getElementById('announcePreviewCard');
  const previewTitle = document.getElementById('previewTitle');
  const previewMsg = document.getElementById('previewMessage');
  const previewImg = document.getElementById('previewImage');
  const previewPing = document.getElementById('previewPingNotice');

  if (previewCard) previewCard.style.borderLeftColor = color;
  if (previewTitle) previewTitle.innerText = title;
  if (previewMsg) previewMsg.innerText = msg;

  if (previewPing) {
    if (ping === 'everyone') {
      previewPing.style.display = 'block';
      previewPing.innerText = '@everyone';
    } else if (ping === 'here') {
      previewPing.style.display = 'block';
      previewPing.innerText = '@here';
    } else {
      previewPing.style.display = 'none';
    }
  }

  if (previewImg) {
    if (imgUrl) {
      previewImg.src = imgUrl;
      previewImg.style.display = 'block';
    } else {
      previewImg.style.display = 'none';
    }
  }
}

// --- TAB 6: Announcements Handler (Supports Multiple Channels Simultaneously) ---
async function handleSendAnnouncement(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSendAnnouncement');
  btn.disabled = true;
  btn.innerText = '⏳ Broadcasting to Discord...';

  const select = document.getElementById('announceChannel');
  const selectedChannels = Array.from(select.selectedOptions).map(opt => opt.value).filter(Boolean);

  if (selectedChannels.length === 0) {
    showToast('Please select at least one Discord channel', 'warning');
    btn.disabled = false;
    btn.innerText = '🚀 Broadcast Announcement to Discord Channels';
    return;
  }

  const payload = {
    channelIds: selectedChannels,
    ping: document.getElementById('announcePing').value,
    color: document.getElementById('announceColor').value,
    title: document.getElementById('announceTitle').value.trim(),
    message: document.getElementById('announceMessage').value.trim(),
    imageUrl: document.getElementById('announceImage').value.trim() || null
  };

  try {
    const res = await apiFetch('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res && res.success) {
      showToast(res.message || 'Announcement broadcasted to Discord!', 'success');
      document.getElementById('announcementForm').reset();
      updateAnnouncementPreview();
    } else {
      showToast(res ? res.message : 'Failed to send announcement', 'danger');
    }
  } catch (err) {
    showToast('Network error sending announcement', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '🚀 Broadcast Announcement to Discord Channels';
  }
}

// --- TAB 4 (Extension): Match Management & Self-Reporting (TD Approval) ---
let cachedTournamentMatches = [];

async function loadMatchesAndPendingApprovals(tourneyId) {
  if (!tourneyId) return;

  const [matchesRes, pendingRes] = await Promise.all([
    apiFetch(`/api/tournaments/${tourneyId}/matches`),
    apiFetch(`/api/tournaments/${tourneyId}/pending-matches`)
  ]);

  const matches = (matchesRes && matchesRes.matches) || [];
  const pending = (pendingRes && pendingRes.pendingMatches) || [];
  cachedTournamentMatches = matches;

  // 1. Populate Match Selector for Table Assignment
  const matchSelect = document.getElementById('matchSelectForTable');
  if (matchSelect) {
    if (matches.length === 0) {
      matchSelect.innerHTML = '<option value="">No fixtures yet. Click "Create Match" below.</option>';
      document.getElementById('displayMatchCode').value = '';
    } else {
      matchSelect.innerHTML = '<option value="">Select match fixture...</option>' + matches.map(m => {
        const tableTxt = m.table_number ? `[Table ${m.table_number}]` : '[Unassigned]';
        return `<option value="${m.id}" data-code="${m.match_code}">${tableTxt} ${m.round_name}: ${m.player1} vs ${m.player2} (${m.match_code})</option>`;
      }).join('');
    }
  }

  // 2. Render Pending Self-Reported Matches for Director Review & Approval
  const pendingFeed = document.getElementById('pendingMatchesList');
  const pendingBadge = document.getElementById('pendingMatchesCount');

  if (pendingBadge) {
    pendingBadge.innerText = `${pending.length} Pending`;
    pendingBadge.className = pending.length > 0 ? 'badge badge-warning' : 'badge badge-closed';
  }

  if (pendingFeed) {
    if (pending.length === 0) {
      pendingFeed.innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <span style="font-size: 1.8rem; display: block; margin-bottom: 6px;">✅</span>
          No pending match submissions from players.<br>
          <span class="text-muted text-sm">When players finish and submit on mobile, they appear here for 1-click approval.</span>
        </div>
      `;
    } else {
      pendingFeed.innerHTML = pending.map(m => `
        <div class="score-match-card" style="border-left: 4px solid #f59e0b;">
          <div class="score-match-header">
            <span class="score-round-title">⏳ <strong>${escapeHtml(m.round_name)}</strong> — Code: <code>${m.match_code}</code></span>
            <span class="badge badge-warning">Awaiting Approval</span>
          </div>
          <div class="score-match-body">
            <div class="score-vs-teams">
              <strong>${escapeHtml(m.player1)}</strong> vs <strong>${escapeHtml(m.player2)}</strong>
              ${m.table_number ? `<span class="table-tag" style="margin-left: 8px; font-size: 0.75rem; background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px;">Table ${m.table_number}</span>` : ''}
            </div>
            <div style="margin-top: 6px;">
              <span class="score-badge-result">Reported Score: ${escapeHtml(m.submitted_score || `${m.player1_score} - ${m.player2_score}`)}</span>
            </div>
          </div>
          <div class="score-match-winner" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Reported Winner: 🏆 <strong>${escapeHtml(m.submitted_winner || m.player1)}</strong></span>
            <button class="btn btn-xs btn-success" onclick="openApproveModal('${m.id}', '${escapeHtml(m.round_name)}', '${escapeHtml(m.player1)}', '${escapeHtml(m.player2)}', '${escapeHtml(m.submitted_score || '')}', '${escapeHtml(m.submitted_winner || m.player1)}')">
              ✅ Review & Approve
            </button>
          </div>
        </div>
      `).join('');
    }
  }
}

function handleMatchSelectChange() {
  const select = document.getElementById('matchSelectForTable');
  const codeInput = document.getElementById('displayMatchCode');
  const selectedOpt = select.options[select.selectedIndex];
  if (selectedOpt && selectedOpt.dataset.code) {
    codeInput.value = selectedOpt.dataset.code;
  } else {
    codeInput.value = '';
  }
}

async function handleAssignTable(e) {
  e.preventDefault();
  const matchId = document.getElementById('matchSelectForTable').value;
  const tableNumber = document.getElementById('assignTableNumber').value.trim();

  if (!matchId || !tableNumber) {
    showToast('Please select match fixture and enter Table number', 'warning');
    return;
  }

  const btn = document.getElementById('btnAssignTable');
  btn.disabled = true;
  btn.innerText = '📲 Sending Match Call & Mobile Link...';

  try {
    const res = await apiFetch(`/api/matches/${matchId}/assign-table`, {
      method: 'POST',
      body: JSON.stringify({ table_number: tableNumber })
    });

    if (res && res.success) {
      showToast(res.message || 'Table assigned & direct live-scoring link dispatched to players!', 'success');
      const tourneyId = document.getElementById('scoreTourneySelect').value;
      loadMatchesAndPendingApprovals(tourneyId);
      document.getElementById('assignTableNumber').value = '';
    } else {
      showToast(res ? res.message : 'Failed to assign table', 'danger');
    }
  } catch (err) {
    showToast('Network error assigning table', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '📲 Assign Table & Send Mobile Live-Score Link';
  }
}

// Create Match Modal Helpers
function openCreateMatchModal() {
  populateTournamentDropdowns();
  const sel = document.getElementById('modalMatchTourneySelect');
  const currentTourney = document.getElementById('scoreTourneySelect').value;
  if (sel) {
    sel.innerHTML = cachedTournaments.map(t => `<option value="${t.id}" ${t.id == currentTourney ? 'selected' : ''}>#${t.id} - ${escapeHtml(t.title || t.name)}</option>`).join('');
  }
  document.getElementById('createMatchModal').classList.remove('hidden');
}

function closeCreateMatchModal() {
  document.getElementById('createMatchModal').classList.add('hidden');
}

async function handleCreateMatchSubmit(e) {
  e.preventDefault();
  const tourneyId = document.getElementById('modalMatchTourneySelect').value;
  const payload = {
    round_name: document.getElementById('modalMatchRound').value.trim(),
    player1: document.getElementById('modalMatchP1').value.trim(),
    player2: document.getElementById('modalMatchP2').value.trim() || 'TBD',
    table_number: document.getElementById('modalMatchTable').value.trim() || null
  };

  try {
    const res = await apiFetch(`/api/tournaments/${tourneyId}/matches/create`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res && res.success) {
      showToast(`Match fixture created with Code: ${res.match.match_code}`, 'success');
      closeCreateMatchModal();
      document.getElementById('modalMatchRound').value = '';
      document.getElementById('modalMatchP1').value = '';
      document.getElementById('modalMatchP2').value = '';
      document.getElementById('modalMatchTable').value = '';
      loadMatchesAndPendingApprovals(tourneyId);
    } else {
      showToast(res ? res.message : 'Failed to create match fixture', 'danger');
    }
  } catch (err) {
    showToast('Network error creating match fixture', 'danger');
  }
}

// Approve Self-Report Modal Helpers
function openApproveModal(matchId, round, p1, p2, score, winner) {
  document.getElementById('approveMatchId').value = matchId;
  document.getElementById('approveMatchTitle').innerText = `${round}: ${p1} vs ${p2}`;
  document.getElementById('approveMatchReportedBy').innerText = `Reported winner: ${winner} | Submitted Score: ${score || 'N/A'}`;
  document.getElementById('approveMatchScore').value = score || '1 - 0';
  document.getElementById('approveMatchWinner').value = winner || p1;
  document.getElementById('approveMatchModal').classList.remove('hidden');
}

function closeApproveMatchModal() {
  document.getElementById('approveMatchModal').classList.add('hidden');
}

async function handleApproveMatchSubmit(e) {
  e.preventDefault();
  const matchId = document.getElementById('approveMatchId').value;
  const final_score = document.getElementById('approveMatchScore').value.trim();
  const final_winner = document.getElementById('approveMatchWinner').value.trim();

  try {
    const res = await apiFetch(`/api/matches/${matchId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ final_score, final_winner })
    });

    if (res && res.success) {
      showToast('Match APPROVED! Table released, bracket advanced, & live scoreboard updated!', 'success');
      closeApproveMatchModal();
      const tourneyId = document.getElementById('scoreTourneySelect').value;
      handleScoreTourneyChange();
    } else {
      showToast(res ? res.message : 'Failed to approve match', 'danger');
    }
  } catch (err) {
    showToast('Network error approving match', 'danger');
  }
}

// --- TAB: Esports Broadcast & Production Suite (TournaLink + WASP3D) ---
function loadProductionTab() {
  populateTournamentDropdowns();
  const sel = document.getElementById('prodTourneySelect');
  const scoreSel = document.getElementById('scoreTourneySelect');
  if (sel && scoreSel && scoreSel.value) {
    sel.value = scoreSel.value;
  } else if (sel && sel.options.length > 1) {
    sel.selectedIndex = 1;
  }
  handleProductionTourneyChange();
}

async function handleProductionTourneyChange() {
  const tourneyId = document.getElementById('prodTourneySelect').value;
  const origin = window.location.origin;

  document.getElementById('urlOverlayLeaderboard').value = `${origin}/overlay/leaderboard?tourneyId=${tourneyId}`;
  document.getElementById('urlOverlayTicker').value = `${origin}/overlay/ticker?tourneyId=${tourneyId}`;
  document.getElementById('urlOverlayWinner').value = `${origin}/overlay/winner?tourneyId=${tourneyId}`;

  // Populate active matches dropdown for live stream ticker
  const matchRes = await apiFetch(`/api/tournaments/${tourneyId}/matches`);
  const matches = (matchRes && matchRes.matches) || [];
  const prodMatchSel = document.getElementById('prodMatchSelector');
  if (prodMatchSel) {
    if (matches.length === 0) {
      prodMatchSel.innerHTML = '<option value="">No active matches found.</option>';
    } else {
      prodMatchSel.innerHTML = '<option value="">Select match to display on stream ticker...</option>' + matches.map(m => `
        <option value="${m.id}">${m.round_name}: ${m.player1} vs ${m.player2} [Table: ${m.table_number || 'N/A'}] (Score: ${m.player1_score} - ${m.player2_score})</option>
      `).join('');
    }
  }
}

function openOverlayInNewTab(type) {
  const tourneyId = document.getElementById('prodTourneySelect').value;
  window.open(`/overlay/${type}?tourneyId=${tourneyId}`, '_blank');
}

function copyOverlayUrl(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast('Overlay URL copied! Paste into OBS as a Browser Source (1920x1080).', 'success');
}

async function updateBroadcastActiveMatch() {
  const matchId = document.getElementById('prodMatchSelector').value;
  if (!matchId) return;
  const tourneyId = document.getElementById('prodTourneySelect').value;
  await apiFetch('/api/overlay/set-active-match', {
    method: 'POST',
    body: JSON.stringify({ tourneyId, matchId })
  });
  showToast('Active stream match updated on OBS ticker!', 'info');
}

async function triggerOverlayState(state) {
  const tourneyId = document.getElementById('prodTourneySelect').value;
  await apiFetch('/api/overlay/set-state', {
    method: 'POST',
    body: JSON.stringify({ tourneyId, state })
  });
  showToast(`Stream graphic trigger: ${state.toUpperCase()}`, 'success');
}

// Custom Room Modal Handlers
function openRoomModal(tourneyId) {
  document.getElementById('roomTourneyId').value = tourneyId;
  document.getElementById('roomModal').classList.remove('hidden');
}

function closeRoomModal() {
  document.getElementById('roomModal').classList.add('hidden');
  document.getElementById('roomForm').reset();
}

async function handleBroadcastRoomSubmit(e) {
  e.preventDefault();
  const tourneyId = document.getElementById('roomTourneyId').value;
  const room_id = document.getElementById('roomInputId').value.trim();
  const room_pass = document.getElementById('roomInputPass').value.trim();
  const map_name = document.getElementById('roomInputMap').value.trim();

  const btn = document.getElementById('btnBroadcastRoom');
  btn.disabled = true;
  btn.innerText = '⏳ Dispatching to Players via DM...';

  try {
    const res = await apiFetch(`/api/tournaments/${tourneyId}/broadcast-room`, {
      method: 'POST',
      body: JSON.stringify({ room_id, room_pass, map_name })
    });

    if (res && res.success) {
      showToast(res.message || 'Custom room credentials sent to players!', 'success');
      closeRoomModal();
    } else {
      showToast(res ? res.message : 'Failed to dispatch room credentials', 'danger');
    }
  } catch (err) {
    showToast('Network error broadcasting room credentials', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '🚀 Send Room ID & Pass to Players';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. SPORTS LEAGUE & STATE MEETS CLIENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function loadLeagues() {
  try {
    const res = await apiFetch('/api/leagues');
    cachedLeagues = (res && res.leagues) || [];

    const select = document.getElementById('activeLeagueSelect');
    if (!select) return;

    if (cachedLeagues.length === 0) {
      select.innerHTML = '<option value="">No Sports Leagues found (Click Create)</option>';
      document.getElementById('leagueDashboardSection').classList.add('hidden');
      document.getElementById('noLeaguePlaceholder').classList.remove('hidden');
      return;
    }

    select.innerHTML = cachedLeagues.map(l => `
      <option value="${l.id}" ${l.id === activeLeagueId ? 'selected' : ''}>
        ${l.name} (${l.sport} - ${l.age_category || 'Open'})
      </option>
    `).join('');

    if (!activeLeagueId || !cachedLeagues.some(l => l.id === activeLeagueId)) {
      activeLeagueId = cachedLeagues[0].id;
      select.value = activeLeagueId;
    }

    loadActiveLeagueDetails(activeLeagueId);
  } catch (err) {
    showToast('Failed to load sports leagues', 'danger');
  }
}

function handleLeagueSelectChange(val) {
  if (!val) return;
  activeLeagueId = parseInt(val, 10);
  loadActiveLeagueDetails(activeLeagueId);
}

async function loadActiveLeagueDetails(leagueId) {
  if (!leagueId) return;
  try {
    const res = await apiFetch(`/api/leagues/${leagueId}`);
    if (!res || !res.success) {
      showToast(res ? res.message : 'League details unavailable', 'danger');
      return;
    }

    const { league, teams, standings, matches } = res;
    document.getElementById('leagueDashboardSection').classList.remove('hidden');
    document.getElementById('noLeaguePlaceholder').classList.add('hidden');

    // Status Badge
    const badgeContainer = document.getElementById('leagueStatusBadgeContainer');
    if (badgeContainer) {
      const isPlayoffs = league.status === 'PLAYOFFS';
      badgeContainer.innerHTML = isPlayoffs 
        ? '<span class="badge" style="background: rgba(255,171,0,0.2); color: #FFAB00; border: 1px solid #FFAB00; font-size: 0.9rem; padding: 6px 14px;">⚡ PLAYOFFS / SEMIFINALS ACTIVE</span>'
        : '<span class="badge" style="background: rgba(0,230,118,0.2); color: #00E676; border: 1px solid #00E676; font-size: 0.9rem; padding: 6px 14px;">🟢 GROUP / POOL STAGE</span>';
    }

    // Stats Grid
    document.getElementById('leagueTeamCount').innerText = `${teams.length} / ${league.max_teams || 10}`;
    document.getElementById('leagueCategoryDisplay').innerText = `${league.sport} (${league.age_category || 'U-17'})`;
    document.getElementById('leagueGenderDisplay').innerText = `${league.gender_category || 'Boys'} Category`;
    document.getElementById('leagueMatchesCount').innerText = matches.length;
    document.getElementById('leagueStageDisplay').innerText = league.status || 'GROUP STAGE';

    // Render Standings Tables
    renderPoolTable('poolATableBody', standings.poolA || []);
    renderPoolTable('poolBTableBody', standings.poolB || []);

    // Render Fixtures
    renderLeagueMatches(matches);

    // Disable or Enable Admin-only elements based on role
    const autoPlayoffsBtn = document.getElementById('btnAutoPlayoffs');
    if (autoPlayoffsBtn) {
      autoPlayoffsBtn.style.display = currentRole === 'admin' ? 'inline-block' : 'none';
    }
  } catch (err) {
    showToast('Failed to load active league dashboard', 'danger');
  }
}

function renderPoolTable(tbodyId, teams) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (teams.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding: 16px; color: var(--text-muted);">No teams registered in this pool yet</td></tr>';
    return;
  }

  tbody.innerHTML = teams.map((t, idx) => {
    const isTop2 = idx < 2;
    return `
      <tr style="${isTop2 ? 'background: rgba(0,230,118,0.04);' : ''}">
        <td><strong>${idx + 1}</strong></td>
        <td>
          <div style="font-weight: 600; color: #fff;">${t.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${t.district || 'State District'}</div>
        </td>
        <td>${t.played || 0}</td>
        <td style="color: #00E676; font-weight: 600;">${t.won || 0}</td>
        <td style="color: #FFAB00;">${t.drawn || 0}</td>
        <td style="color: #FF5252;">${t.lost || 0}</td>
        <td>${t.goals_for || 0}</td>
        <td>${t.goals_against || 0}</td>
        <td style="font-weight: 600; color: ${(t.goal_difference || 0) >= 0 ? '#00E676' : '#FF5252'};">${(t.goal_difference || 0) > 0 ? '+' : ''}${t.goal_difference || 0}</td>
        <td><strong style="color: #00E676; font-size: 1.05rem;">${t.points || 0}</strong></td>
      </tr>
    `;
  }).join('');
}

function renderLeagueMatches(matches) {
  const tbody = document.getElementById('leagueMatchesTableBody');
  if (!tbody) return;

  const filtered = matches.filter(m => {
    if (leagueMatchesFilter === 'SCHEDULED') return m.status === 'SCHEDULED' || m.status === 'LIVE';
    if (leagueMatchesFilter === 'COMPLETED') return m.status === 'COMPLETED';
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 20px; color: var(--text-muted);">No matches match filter</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const isDone = m.status === 'COMPLETED';
    const isLive = m.status === 'LIVE';
    const statusBadge = isDone 
      ? '<span class="badge badge-success">Completed</span>'
      : (isLive ? '<span class="badge" style="background:#FF5252; color:#fff;">🔴 LIVE</span>' : '<span class="badge badge-warning">Scheduled</span>');

    return `
      <tr>
        <td><strong>#${m.id}</strong></td>
        <td><span style="font-weight: 600; color: var(--accent);">${m.round_name}</span></td>
        <td>${m.table_number || 'Court 1'}</td>
        <td>
          <div style="font-size: 0.95rem; font-weight: 600; color: #fff;">
            <span>${m.player1}</span> <span style="color: var(--text-muted); font-size: 0.8rem; margin: 0 4px;">vs</span> <span>${m.player2}</span>
          </div>
        </td>
        <td>${m.scheduled_date ? `${m.scheduled_date} ${m.scheduled_time || ''}` : 'Today / In Session'}</td>
        <td>
          <span style="font-size: 1.1rem; font-weight: 700; color: ${isDone ? '#00E676' : '#fff'};">
            ${m.player1_score !== undefined && m.player1_score !== null ? `${m.player1_score} - ${m.player2_score}` : '0 - 0'}
          </span>
        </td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openUpdateLeagueScoreModal(${m.id}, '${m.player1.replace(/'/g, "\\'")}', '${m.player2.replace(/'/g, "\\'")}', '${m.table_number || 'Court 1'}', ${m.player1_score || 0}, ${m.player2_score || 0}, '${m.status}')">
            ⚖️ Update Score
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterLeagueMatches(status) {
  leagueMatchesFilter = status;
  if (activeLeagueId) loadActiveLeagueDetails(activeLeagueId);
}

// Create Sports League Modal
function openCreateLeagueModal() {
  document.getElementById('createLeagueModal').classList.remove('hidden');
}

function closeCreateLeagueModal() {
  document.getElementById('createLeagueModal').classList.add('hidden');
  document.getElementById('createLeagueForm').reset();
}

async function handleCreateLeagueSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('leagueNameInput').value.trim();
  const sport = document.getElementById('leagueSportInput').value;
  const age_category = document.getElementById('leagueAgeInput').value;
  const gender_category = document.getElementById('leagueGenderInput').value;
  const location = document.getElementById('leagueLocationInput').value.trim();
  const max_teams = document.getElementById('leagueMaxTeamsInput').value;

  const res = await apiFetch('/api/leagues/create', {
    method: 'POST',
    body: JSON.stringify({ name, sport, age_category, gender_category, location, max_teams })
  });

  if (res && res.success) {
    showToast(res.message || 'Sports League created!', 'success');
    closeCreateLeagueModal();
    activeLeagueId = res.league.id;
    loadLeagues();
  } else {
    showToast(res ? res.message : 'Failed to create sports league', 'danger');
  }
}

// Register Team Modal
function openRegisterTeamModal() {
  if (!activeLeagueId) {
    showToast('Please select or create a league first', 'warning');
    return;
  }
  document.getElementById('registerTeamModal').classList.remove('hidden');
}

function closeRegisterTeamModal() {
  document.getElementById('registerTeamModal').classList.add('hidden');
  document.getElementById('registerTeamForm').reset();
}

async function handleRegisterTeamSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('teamNameInput').value.trim();
  const district = document.getElementById('teamDistrictInput').value.trim();
  const pool = document.getElementById('teamPoolInput').value;
  const coach = document.getElementById('teamCoachInput').value.trim();
  const contact = document.getElementById('teamContactInput').value.trim();

  const res = await apiFetch(`/api/leagues/${activeLeagueId}/teams`, {
    method: 'POST',
    body: JSON.stringify({ name, district, pool, coach, contact })
  });

  if (res && res.success) {
    showToast(res.message || 'Team registered successfully!', 'success');
    closeRegisterTeamModal();
    loadActiveLeagueDetails(activeLeagueId);
  } else {
    showToast(res ? res.message : 'Registration failed', 'danger');
  }
}

// Schedule Match Modal
async function openScheduleMatchModal() {
  if (!activeLeagueId) {
    showToast('Please select or create a league first', 'warning');
    return;
  }
  const res = await apiFetch(`/api/leagues/${activeLeagueId}`);
  const teams = (res && res.teams) || [];
  if (teams.length < 2) {
    showToast('Need at least 2 teams registered in the league to schedule matches!', 'warning');
    return;
  }

  const t1Select = document.getElementById('leagueMatchT1Select');
  const t2Select = document.getElementById('leagueMatchT2Select');
  t1Select.innerHTML = teams.map(t => `<option value="${t.name}">${t.name} (${t.pool})</option>`).join('');
  t2Select.innerHTML = teams.map(t => `<option value="${t.name}">${t.name} (${t.pool})</option>`).join('');
  if (teams.length > 1) t2Select.selectedIndex = 1;

  document.getElementById('scheduleMatchModal').classList.remove('hidden');
}

function closeScheduleMatchModal() {
  document.getElementById('scheduleMatchModal').classList.add('hidden');
  document.getElementById('scheduleMatchForm').reset();
}

async function handleScheduleLeagueMatchSubmit(e) {
  e.preventDefault();
  const round_name = document.getElementById('leagueMatchRoundInput').value.trim();
  const player1 = document.getElementById('leagueMatchT1Select').value;
  const player2 = document.getElementById('leagueMatchT2Select').value;
  const table_number = document.getElementById('leagueMatchCourtInput').value.trim();
  const dateTimeVal = document.getElementById('leagueMatchDateTimeInput').value;

  let match_date = null;
  let match_time = null;
  if (dateTimeVal) {
    const parts = dateTimeVal.split('T');
    match_date = parts[0];
    match_time = parts[1];
  }

  const res = await apiFetch(`/api/leagues/${activeLeagueId}/matches/schedule`, {
    method: 'POST',
    body: JSON.stringify({ round_name, player1, player2, table_number, match_date, match_time })
  });

  if (res && res.success) {
    showToast(res.message || 'Match scheduled!', 'success');
    closeScheduleMatchModal();
    loadActiveLeagueDetails(activeLeagueId);
  } else {
    showToast(res ? res.message : 'Failed to schedule match', 'danger');
  }
}

// Update Score Modal
function openUpdateLeagueScoreModal(matchId, p1, p2, court, s1, s2, status) {
  document.getElementById('scoringMatchId').value = matchId;
  document.getElementById('scoringMatchupTitle').innerText = `${p1} vs ${p2}`;
  document.getElementById('scoringMatchCourt').innerText = court;
  document.getElementById('scoringT1Label').innerText = `${p1} Score`;
  document.getElementById('scoringT2Label').innerText = `${p2} Score`;
  document.getElementById('scoringT1Input').value = s1 || 0;
  document.getElementById('scoringT2Input').value = s2 || 0;
  document.getElementById('scoringStatusSelect').value = status || 'COMPLETED';

  document.getElementById('updateLeagueScoreModal').classList.remove('hidden');
}

function closeUpdateLeagueScoreModal() {
  document.getElementById('updateLeagueScoreModal').classList.add('hidden');
}

async function handleUpdateLeagueScoreSubmit(e) {
  e.preventDefault();
  const matchId = document.getElementById('scoringMatchId').value;
  const player1_score = document.getElementById('scoringT1Input').value;
  const player2_score = document.getElementById('scoringT2Input').value;
  const status = document.getElementById('scoringStatusSelect').value;

  const res = await apiFetch(`/api/leagues/${activeLeagueId}/matches/${matchId}/score`, {
    method: 'POST',
    body: JSON.stringify({ player1_score, player2_score, status })
  });

  if (res && res.success) {
    showToast(res.message || 'Score updated and standings recalculated!', 'success');
    closeUpdateLeagueScoreModal();
    loadActiveLeagueDetails(activeLeagueId);
  } else {
    showToast(res ? res.message : 'Failed to update score', 'danger');
  }
}

// Auto-generate Semifinal & Final Playoffs
async function handleGeneratePlayoffs() {
  if (!activeLeagueId) return;
  if (!confirm('Auto-generate Semifinals & Finals? This will pair Pool A #1 vs Pool B #2, and Pool B #1 vs Pool A #2 into the championship bracket!')) {
    return;
  }

  const res = await apiFetch(`/api/leagues/${activeLeagueId}/generate-playoffs`, {
    method: 'POST'
  });

  if (res && res.success) {
    showToast(res.message || 'Semifinals and Grand Final created with bracket linkage!', 'success');
    loadActiveLeagueDetails(activeLeagueId);
  } else {
    showToast(res ? res.message : 'Cannot generate playoffs yet', 'danger');
  }
}
