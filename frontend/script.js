const API_BASE = 'http://localhost:8000';
const WS_URL   = 'ws://localhost:8000/ws';
let globalWs = null;
let ws             = null;
let currentMatchId = null;
let homeTeam       = null;
let scoreHome      = 0, scoreAway = 0;
let knownEventIds  = new Set();
const stats = { goals: 0, cards: 0, fouls: 0, saves: 0, events: 0 };

// ── WebSocket reconnect state ─────────────────
let reconnectTimer     = null;
let reconnectAttempts  = 0;
const MAX_RECONNECT    = 10;

const EVENT_CONFIG = {
  GOAL:        { icon: '⚽', label: 'GOAL' },
  YELLOW_CARD: { icon: '🟨', label: 'YELLOW' },
  RED_CARD:    { icon: '🟥', label: 'RED CARD' },
  SUBSTITUTION:{ icon: '🔄', label: 'SUB' },
  PENALTY:     { icon: '⚠️',  label: 'PENALTY' },
  CORNER:      { icon: '🚩', label: 'CORNER' },
  FOUL:        { icon: '🤚', label: 'FOUL' },
  SAVE:        { icon: '🧤', label: 'SAVE' },
  KICKOFF:     { icon: '🏁', label: 'KICKOFF' },
  HALFTIME:    { icon: '⏸️', label: 'HALF TIME' },
  FULLTIME:    { icon: '🏆', label: 'FULL TIME' },
};

const matchesScreen  = document.getElementById('matches-screen');
const feedScreen     = document.getElementById('feed-screen');
const matchesLoading = document.getElementById('matches-loading');
const matchesError   = document.getElementById('matches-error');
const matchesGrid    = document.getElementById('matches-grid');
const retryBtn       = document.getElementById('retry-btn');
const backBtn        = document.getElementById('back-btn');
const feed           = document.getElementById('commentary-feed');
const emptyState     = document.getElementById('empty-state');
const goalOverlay    = document.getElementById('goal-overlay');
const goalScorer     = document.getElementById('goal-scorer');

loadMatches();
connectGlobalWebSocket();
retryBtn.addEventListener('click', loadMatches);

// ── Fetch match list ──────────────────────────
async function loadMatches() {
  matchesLoading.classList.remove('hidden');
  matchesError.classList.add('hidden');
  matchesGrid.classList.add('hidden');
  matchesGrid.innerHTML = '';
  try {
    const res  = await fetch(`${API_BASE}/matches`);
    if (!res.ok) throw new Error();
    const json = await res.json();
    const list = Array.isArray(json) ? json : (json.data ?? []);
    matchesLoading.classList.add('hidden');
    if (!list.length) {
      matchesError.querySelector('span').textContent = '⚠ No matches found.';
      matchesError.classList.remove('hidden');
      return;
    }
    renderMatches(list);
    matchesGrid.classList.remove('hidden');
  } catch {
    matchesLoading.classList.add('hidden');
    matchesError.classList.remove('hidden');
  }
}

// ── Render match cards ────────────────────────
function renderMatches(matches) {
  matches.forEach(match => {
    const homeName    = match.homeTeam ?? match.home_team ?? match.team1 ?? match.teamA ?? `Team ${match.id}A`;
    const awayName    = match.awayTeam ?? match.away_team ?? match.team2 ?? match.teamB ?? `Team ${match.id}B`;
    const status      = (match.status ?? match.state ?? 'upcoming').toUpperCase();
    const raw         = match.date ?? match.scheduledAt ?? match.createdAt;
    const dateStr     = raw ? new Date(raw).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const statusClass = status === 'LIVE' ? 'live' : (status === 'FINISHED' || status === 'COMPLETED') ? 'finished' : 'upcoming';
    const statusLabel = status === 'LIVE' ? '● LIVE' : (status === 'FINISHED' || status === 'COMPLETED') ? 'FINISHED' : 'UPCOMING';

    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
      <div class="match-card-top">
        <span class="match-card-id">MATCH #${match.id}</span>
        <span class="match-status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="match-teams">
        <div class="team-block">
          <span class="team-name-big">${homeName}</span>
          <span class="team-sub">Home</span>
        </div>
        <div class="match-score-center"><span class="score-display">VS</span></div>
        <div class="team-block away">
          <span class="team-name-big">${awayName}</span>
          <span class="team-sub">Away</span>
        </div>
      </div>
      <div class="match-card-footer">
        <span class="match-meta">${dateStr}</span>
        <span class="watch-btn">WATCH LIVE →</span>
      </div>
    `;
    card.addEventListener('click', () => openMatch(Number(match.id), homeName, awayName));
    matchesGrid.appendChild(card);
  });
}

// ── Open a match ──────────────────────────────
async function openMatch(matchId, homeName, awayName) {
  // Tear down any existing connection cleanly
  disconnectWebSocket();
  resetFeed();

  currentMatchId = matchId;
  homeTeam       = homeTeam;
  scoreHome      = scoreAway = 0;

  document.getElementById('current-match-id').textContent = matchId;
  document.getElementById('home-name').textContent        = homeName ?? '—';
  document.getElementById('away-name').textContent        = awayName ?? '—';

  matchesScreen.classList.remove('active');
  feedScreen.classList.add('active');

  await loadHistory(matchId);
  connectWebSocket(matchId);
}

// ── Load existing commentary once ────────────
async function loadHistory(matchId) {
  try {
    const res  = await fetch(`${API_BASE}/commentary/match/${matchId}`);
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const list = Array.isArray(json) ? json : (json.data ?? []);
    list.sort((a, b) => (a.sequence ?? a.id ?? 0) - (b.sequence ?? b.id ?? 0));
    list.forEach(event => {
      knownEventIds.add(String(event.id));
      processEvent(event, false);
    });
  } catch(e) {
    console.error('[History] failed:', e.message);
    addSystemCard('⚠ Could not load match history.');
  }
}

// ── Persistent WebSocket connection ──────────
function connectWebSocket(matchId) {
  // Guard: don't open if we already have a live socket for this match
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.warn('[WS] Already connected, skipping duplicate connect');
    return;
  }

  updateWsStatus('connecting');
  console.log(`[WS] Opening connection (attempt ${reconnectAttempts + 1})…`);

  // FIX 1: Explicitly request the WebSocket upgrade with no extra headers that
  // some browsers may reject. Plain `new WebSocket(url)` is correct — do NOT
  // pass a subprotocol array unless your server negotiates one.
  ws = new WebSocket(WS_URL);

ws.onopen = () => {
  console.log('[WS] Connected. Subscribing to match', matchId);
  // Test if timing is the issue
  // setTimeout(() => {
  //   console.log('[WS] Sending subscribe, readyState:', ws.readyState);
  //   ws.send(JSON.stringify({ type: 'subscribe', matchesId: Number(matchId) }));
  // }, 500);
};

  ws.onmessage = (e) => {
    console.log('[WS] Raw message:', e.data);
    try {
      const raw = JSON.parse(e.data);

      switch (raw.type) {
        case 'welcome':
          // Server handshake — connection is healthy
          console.log('[WS] Server welcomed us');
              ws.send(JSON.stringify({ type: 'subscribe', matchesId: Number(matchId) }));
          return;

        case 'subscribed':
          console.log('[WS] Subscription confirmed for match', raw.matchesId);
          updateWsStatus('live');
          return;

        case 'commentary': {
          const event = raw.data;
          // FIX 4: Guard against malformed payloads from the server
          if (!event || !event.message) {
            console.warn('[WS] Received commentary with no message, skipping:', raw);
            return;
          }
          const key = String(event.id);
          if (knownEventIds.has(key)) {
            console.log('[WS] Duplicate event, skipping:', key);
            return;
          }
          knownEventIds.add(key);
          processEvent(event, true);
          return;
        }

case 'match created':
  console.log('[WS] New match broadcast received:', raw.data);
  // If user is on the matches screen, prepend the new card live
  if (matchesScreen.classList.contains('active')) {
    prependMatch(raw.data);
  }
  return;

        default:
          console.warn('[WS] Unknown message type:', raw.type, raw);
      }
    } catch(err) {
      console.warn('[WS] JSON parse error:', err, '| Raw:', e.data);
    }
  };

  ws.onerror = (err) => {
    console.error('[WS] Socket error (check DevTools > Network > WS for details)', err);
  };

  ws.onclose = (e) => {
    console.warn(`[WS] Closed — code: ${e.code}, reason: "${e.reason}", clean: ${e.wasClean}`);

    const intentional = e.code === 1000 || e.code === 1001;
    if (intentional) {
      updateWsStatus('disconnected');
      return;
    }

    if (feedScreen.classList.contains('active') && currentMatchId === matchId) {
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.error('[WS] Max reconnect attempts reached');
        updateWsStatus('error');
        addSystemCard('⚠ Connection lost. Please refresh the page.');
        return;
      }
      const delay = Math.min(1000 * 2 ** reconnectAttempts + Math.random() * 500, 30000);
      reconnectAttempts++;
      console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT})…`);
      updateWsStatus('disconnected');
      reconnectTimer = setTimeout(() => {
        if (feedScreen.classList.contains('active') && currentMatchId === matchId) {
          connectWebSocket(matchId);
        }
      }, delay);
    }
  };
}

function prependMatch(match) {
  // If grid was hidden (empty state), show it
  matchesError.classList.add('hidden');
  matchesGrid.classList.remove('hidden');

  const homeName    = match.homeTeam ?? match.home_team ?? match.team1 ?? match.teamA ?? `Team ${match.id}A`;
  const awayName    = match.awayTeam ?? match.away_team ?? match.team2 ?? match.teamB ?? `Team ${match.id}B`;
  const status      = (match.status ?? match.state ?? 'upcoming').toUpperCase();
  const raw         = match.date ?? match.scheduledAt ?? match.createdAt;
  const dateStr     = raw ? new Date(raw).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const statusClass = status === 'LIVE' ? 'live' : (status === 'FINISHED' || status === 'COMPLETED') ? 'finished' : 'upcoming';
  const statusLabel = status === 'LIVE' ? '● LIVE' : (status === 'FINISHED' || status === 'COMPLETED') ? 'FINISHED' : 'UPCOMING';

  const card = document.createElement('div');
  card.className = 'match-card new-match-flash'; // flash class for highlight
  card.innerHTML = `
    <div class="match-card-top">
      <span class="match-card-id">MATCH #${match.id}</span>
      <span class="match-status-badge ${statusClass}">${statusLabel}</span>
    </div>
    <div class="match-teams">
      <div class="team-block">
        <span class="team-name-big">${homeName}</span>
        <span class="team-sub">Home</span>
      </div>
      <div class="match-score-center"><span class="score-display">VS</span></div>
      <div class="team-block away">
        <span class="team-name-big">${awayName}</span>
        <span class="team-sub">Away</span>
      </div>
    </div>
    <div class="match-card-footer">
      <span class="match-meta">${dateStr}</span>
      <span class="watch-btn">WATCH LIVE →</span>
    </div>
  `;
  card.addEventListener('click', () => openMatch(Number(match.id), homeName, awayName));

  // Prepend so newest match appears at the top
  matchesGrid.insertBefore(card, matchesGrid.firstChild);

  // Remove flash after animation completes
  setTimeout(() => card.classList.remove('new-match-flash'), 2000);
}


// ── Clean teardown ────────────────────────────
function disconnectWebSocket() {
  // FIX 8: Cancel any pending reconnect timer before closing, otherwise the
  // timer callback fires after navigating away and opens a ghost connection.
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  if (ws) {
    // Close with code 1000 = normal closure; this prevents the onclose handler
    // from triggering a reconnect (see intentional check above).
    ws.close(1000, 'User navigated away');
    ws = null;
  }
}

// ── Back button ───────────────────────────────
backBtn.addEventListener('click', () => {
  disconnectWebSocket();
  currentMatchId = null;
  feedScreen.classList.remove('active');
  matchesScreen.classList.add('active');
});

// ── Process one event ─────────────────────────
function processEvent(event, isLive) {
  emptyState.style.display = 'none';
  stats.events++;

  if (event.minute != null) document.getElementById('current-minute').textContent = event.minute;
  if (event.period)         document.getElementById('current-period').textContent = event.period.replace('_', ' ');

  switch (event.eventType) {
    case 'GOAL':        stats.goals++;  updateScore(event); if (isLive) showGoalOverlay(event.actor); break;
    case 'YELLOW_CARD':
    case 'RED_CARD':    stats.cards++;  break;
    case 'FOUL':        stats.fouls++;  break;
    case 'SAVE':        stats.saves++;  break;
  }

  updateStats();
  addEventCard(event, isLive);
}

// ── Score ─────────────────────────────────────
function updateScore(event) {
  if (!event.team) return;
  if (!homeTeam) homeTeam = event.team;
  if (event.team === homeTeam) { scoreHome++; bumpEl('score-home', scoreHome); }
  else                          { scoreAway++; bumpEl('score-away', scoreAway); }
}

function bumpEl(id, val) {
  const el = document.getElementById(id);
  el.textContent = val;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}

function updateStats() {
  const map = { 'stat-goals': stats.goals, 'stat-cards': stats.cards, 'stat-fouls': stats.fouls, 'stat-saves': stats.saves, 'stat-events': stats.events };
  for (const [id, val] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el.textContent !== String(val)) {
      el.textContent = val;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 400);
    }
  }
}

// ── Goal overlay ──────────────────────────────
function showGoalOverlay(actor) {
  goalScorer.textContent = actor ? actor.toUpperCase() : '';
  goalOverlay.classList.remove('hidden');
  setTimeout(() => goalOverlay.classList.add('hidden'), 2800);
}

// ── WS status badge ───────────────────────────
function updateWsStatus(state) {
  const badge = document.querySelector('.live-badge');
  if (!badge) return;
  const cfgs = {
    live:         { color: 'var(--danger)',  border: 'rgba(255,60,90,0.4)',   label: 'LIVE' },
    connecting:   { color: 'var(--yellow)',  border: 'rgba(255,214,0,0.4)',   label: 'CONNECTING' },
    disconnected: { color: 'var(--muted)',   border: 'rgba(100,100,100,0.4)', label: 'RECONNECTING' },
    error:        { color: 'var(--danger)',  border: 'rgba(255,60,90,0.4)',   label: 'ERROR' },
  };
  const cfg = cfgs[state] ?? cfgs.disconnected;
  badge.style.color       = cfg.color;
  badge.style.borderColor = cfg.border;
  const dot      = badge.querySelector('.pulse-dot');
  if (dot) dot.style.background = cfg.color;
  const textNode = [...badge.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
  if (textNode) textNode.textContent = cfg.label;
}

// ── Event card ────────────────────────────────
function addEventCard(event, isLive = false) {
  const cfg  = EVENT_CONFIG[event.eventType] ?? { icon: '📋', label: event.eventType ?? 'EVENT' };
  const card = document.createElement('div');
  card.className = `event-card ${event.eventType ?? ''}`;
  const tagsHtml = (event.tags ?? []).map(t => `<span class="tag">${t}</span>`).join('');
  card.innerHTML = `
    <div class="event-minute">${event.minute != null ? event.minute + "'" : '—'}</div>
    <div class="event-body">
      <div class="event-top">
        <span class="event-icon">${cfg.icon}</span>
        <span class="event-type-tag">${cfg.label}</span>
        ${event.actor ? `<span class="event-actor">${event.actor}</span>` : ''}
        ${event.team  ? `<span class="event-team">${event.team}</span>`  : ''}
      </div>
      <div class="event-message">${event.message}</div>
      ${tagsHtml ? `<div class="event-tags">${tagsHtml}</div>` : ''}
    </div>
  `;
  if (isLive) feed.insertBefore(card, feed.firstChild);
  else        feed.appendChild(card);
}

function addSystemCard(msg) {
  const card = document.createElement('div');
  card.className = 'event-card';
  card.style.opacity = '0.5';
  card.innerHTML = `<div class="event-minute">—</div><div class="event-body"><div class="event-message">${msg}</div></div>`;
  feed.insertBefore(card, feed.firstChild);
}

// ── Reset ─────────────────────────────────────
function resetFeed() {
  feed.innerHTML = '';
  knownEventIds.clear();
  emptyState.style.display = 'flex';
  Object.keys(stats).forEach(k => stats[k] = 0);
  updateStats();
  document.getElementById('current-minute').textContent = '0';
  document.getElementById('current-period').textContent = '—';
  document.getElementById('score-home').textContent     = '0';
  document.getElementById('score-away').textContent     = '0';
}

function connectGlobalWebSocket() {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) return;

  globalWs = new WebSocket(WS_URL);

  globalWs.onopen = () => {
    console.log('[Global WS] Connected');
  };

  globalWs.onmessage = (e) => {
    try {
      const raw = JSON.parse(e.data);

      switch (raw.type) {
        case 'welcome':
          console.log('[Global WS] Ready');
          return;
      }
    } catch(err) {
      console.warn('[Global WS] Parse error:', err);
    }
  };

  globalWs.onclose = (e) => {
    if (e.code === 1000) return;
    // Reconnect after 3s
    setTimeout(connectGlobalWebSocket, 3000);
  };

  globalWs.onerror = () => {};
}