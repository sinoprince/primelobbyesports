// Prime Lobby Esports — Tournament Management Software Client Application

let currentToken = localStorage.getItem('ple_admin_token') || '';
let currentTab = 'tournaments';
let cachedTournaments = [];
let cachedPayments = [];
let tournamentFilter = 'all';
let paymentFilter = 'all';

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
  const pinInput = document.getElementById('adminPin');
  const errorEl = document.getElementById('loginError');
  errorEl.classList.add('hidden');

  const secret = pinInput.value.trim();
  if (!secret) return;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret })
    });
    const data = await res.json();
    if (data.success && data.token) {
      currentToken = data.token;
      localStorage.setItem('ple_admin_token', currentToken);
      showDashboard();
      initDashboard();
      showToast('Welcome to Prime Lobby Esports Management Software', 'success');
    } else {
      errorEl.innerText = data.error || 'Invalid Admin Secret Key';
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    errorEl.innerText = 'Server connection failed. Ensure web software is running.';
    errorEl.classList.remove('hidden');
  }
}

function logout() {
  currentToken = '';
  localStorage.removeItem('ple_admin_token');
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
  loadStats();
  loadChannels();
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
  if (currentTab === 'tournaments') {
    loadTournaments();
  } else if (currentTab === 'participants') {
    loadParticipantsTab();
  } else if (currentTab === 'payments') {
    loadPayments();
  } else if (currentTab === 'scoreboard') {
    loadScoreboardTab();
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
            <button class="btn btn-sm btn-success" onclick="startTournament('${t.id}')">⚔️ Start Tournament</button>
            <button class="btn btn-sm btn-danger-outline" onclick="openCloseTourneyModal('${t.id}')">🏁 Close</button>
          ` : ((t.status === 'STARTED' || t.status === 'ACTIVE') ? `
            <button class="btn btn-sm btn-info" onclick="openAddTeamModal('${t.id}')">➕ Add Team</button>
            <button class="btn btn-sm btn-primary" onclick="switchTab('scoreboard')">📊 Update Scores</button>
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

  const payload = {
    round: document.getElementById('scoreRound').value.trim(),
    p1: document.getElementById('scoreP1').value.trim(),
    p2: document.getElementById('scoreP2').value.trim() || 'N/A',
    result: document.getElementById('scoreResult').value.trim(),
    winner: document.getElementById('scoreWinner').value.trim()
  };

  try {
    const res = await apiFetch(`/api/tournaments/${tourneyId}/score`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res && res.success) {
      showToast('Match result submitted and broadcasted to Discord #📊-scoreboard!', 'success');
      document.getElementById('scoreRound').value = '';
      document.getElementById('scoreResult').value = '';
      handleScoreTourneyChange();
    } else {
      showToast(res ? res.message || res.error : 'Failed to broadcast scoreboard', 'danger');
    }
  } catch (err) {
    showToast('Network error updating scoreboard', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '📢 Broadcast Score to Discord #📊-scoreboard';
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

  tbody.innerHTML = data.tickets.map(t => {
    const isClosed = t.status === 'CLOSED';
    return `
      <tr>
        <td><code>#${escapeHtml(t.id || t.channelId)}</code></td>
        <td><span class="badge badge-info">${escapeHtml(t.category || 'General Support')}</span></td>
        <td>${escapeHtml(t.username || t.tag || t.userId)}</td>
        <td><span class="badge ${isClosed ? 'badge-secondary' : 'badge-success'}">${t.status || 'OPEN'}</span></td>
        <td>${t.claimedBy ? escapeHtml(t.claimedBy) : '<span class="text-muted">Unclaimed</span>'}</td>
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

// --- TAB 6: Announcements Handler ---
async function handleSendAnnouncement(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSendAnnouncement');
  btn.disabled = true;
  btn.innerText = '⏳ Broadcasting to Discord...';

  const payload = {
    channelId: document.getElementById('announceChannel').value,
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
    } else {
      showToast(res ? res.message : 'Failed to send announcement', 'danger');
    }
  } catch (err) {
    showToast('Network error sending announcement', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '🚀 Broadcast Announcement to Discord';
  }
}

// --- TAB 7: Server Setup Handler ---
async function runServerSetup(type = 'all', cleanRebuild = false) {
  const confirmMsg = cleanRebuild 
    ? '⚠️ Are you sure you want to run Clean & Rebuild? This will clean obsolete categories and freshly rebuild channels.'
    : `Run ${type.toUpperCase()} setup on your Discord Server?`;

  if (!confirm(confirmMsg)) return;

  showToast(`⏳ Deploying ${type.toUpperCase()} configuration to Discord... Please wait.`, 'info');

  try {
    const res = await apiFetch('/api/setup', {
      method: 'POST',
      body: JSON.stringify({ type, cleanRebuild })
    });

    if (res && res.success) {
      showToast(res.message || 'Server layout and channels deployed successfully!', 'success');
      loadChannels();
    } else {
      showToast(res ? res.message : 'Server setup encountered an issue.', 'danger');
    }
  } catch (err) {
    showToast('Failed to trigger server setup.', 'danger');
  }
}

