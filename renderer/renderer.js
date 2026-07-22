'use strict';

/* ============================================================
   Renderer — status.json'ı okur, org şemasını çizer,
   sayacı akıtır, tema + detay/log panelini yönetir.
   ============================================================ */

const POLL_MS = 2000; // status.json 2 saniyede bir yeniden okunur.

const el = {
  root: document.documentElement,
  projectName: document.getElementById('project-name'),
  timer: document.getElementById('timer'),
  managerSlot: document.getElementById('manager-slot'),
  agentsGrid: document.getElementById('agents-grid'),
  banner: document.getElementById('banner'),
  lastUpdated: document.getElementById('last-updated'),
  footerStats: document.getElementById('footer-stats'),
  statusPath: document.getElementById('status-path'),
  settingsPanel: document.getElementById('settings-panel'),
  btnSettings: document.getElementById('btn-settings'),
  btnTheme: document.getElementById('btn-theme'),
  btnChoose: document.getElementById('btn-choose'),
  btnReload: document.getElementById('btn-reload'),
  // detay paneli
  overlay: document.getElementById('overlay'),
  detail: document.getElementById('detail'),
  detailName: document.getElementById('detail-name'),
  detailRole: document.getElementById('detail-role'),
  detailBadge: document.getElementById('detail-badge'),
  detailStateLabel: document.getElementById('detail-state-label'),
  detailTask: document.getElementById('detail-task'),
  detailLog: document.getElementById('detail-log'),
  detailClose: document.getElementById('detail-close'),
  // oturum keşfi
  btnSessions: document.getElementById('btn-sessions'),
  sessionsDot: document.getElementById('sessions-dot'),
  sessionsCount: document.getElementById('sessions-count'),
  sessionsOverlay: document.getElementById('sessions-overlay'),
  sessionsPanel: document.getElementById('sessions-panel'),
  sessionsList: document.getElementById('sessions-list'),
  sessionsClose: document.getElementById('sessions-close'),
  sessionsSub: document.getElementById('sessions-sub'),
  sessionsWindow: document.getElementById('sessions-window'),
  sessionsDir: document.getElementById('sessions-dir'),
};

let lastSessions = []; // en son taranan oturumlar (canlı yaş için)

let startedAtMs = null;
let lastData = null; // en son okunan veri (detay paneli için)
let openAgentKey = null; // açık olan agent (canlı güncellensin diye)

// ---- Durum normalizasyonu ---------------------------------------------------
function normalizeState(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const map = {
    working: 'working', çalışıyor: 'working', calisiyor: 'working',
    running: 'working', active: 'working', busy: 'working', in_progress: 'working',
    waiting: 'waiting', bekliyor: 'waiting', idle: 'waiting',
    queued: 'waiting', pending: 'waiting',
    done: 'done', bitti: 'done', completed: 'done', complete: 'done',
    finished: 'done', success: 'done',
    stuck: 'stuck', takıldı: 'stuck', takildi: 'stuck', error: 'stuck',
    failed: 'stuck', blocked: 'stuck', hata: 'stuck',
  };
  return map[s] || 'waiting';
}

const STATE_LABEL = {
  working: 'çalışıyor',
  waiting: 'bekliyor',
  done: 'bitti',
  stuck: 'takıldı',
};

// ---- Süre biçimlendirme -----------------------------------------------------
function formatElapsed(ms) {
  if (ms == null || ms < 0 || !isFinite(ms)) return '—';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts = [];
  if (days > 0) parts.push(days + 'g');
  if (days > 0 || hours > 0) parts.push(hours + 's');
  parts.push(mins + 'dk');
  parts.push(secs + 'sn');
  return parts.join(' ');
}

function tickTimer() {
  el.timer.textContent = startedAtMs == null ? '—' : formatElapsed(Date.now() - startedAtMs);
}
setInterval(tickTimer, 1000);

// ---- Log normalizasyonu -----------------------------------------------------
// logs: ["metin"] ya da [{time/ts/timestamp, message/msg/text}]
function normalizeLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return logs.map((l) => {
    if (typeof l === 'string') return { time: '', msg: l };
    const t = l.time || l.ts || l.timestamp || '';
    let timeStr = '';
    if (t) {
      const d = new Date(t);
      timeStr = isNaN(d) ? String(t) : d.toLocaleTimeString('tr-TR');
    }
    return { time: timeStr, msg: l.message || l.msg || l.text || '' };
  });
}

// ---- Kart oluşturma ---------------------------------------------------------
function agentKey(agent, idx) {
  return (agent.name || 'agent') + '#' + idx;
}

function createCard(agent, idx, { isManager = false } = {}) {
  const state = normalizeState(agent.state);
  const card = document.createElement('div');
  card.className = `card state-${state}`;
  if (isManager) card.classList.add('manager-card');

  const head = document.createElement('div');
  head.className = 'card-head';

  const nameWrap = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = agent.name || (isManager ? 'Müdür' : 'İsimsiz agent');
  nameWrap.appendChild(name);
  if (isManager) {
    const role = document.createElement('div');
    role.className = 'card-role';
    role.textContent = 'Müdür';
    nameWrap.appendChild(role);
  }
  head.appendChild(nameWrap);

  const badge = document.createElement('span');
  badge.className = 'badge';
  const dot = document.createElement('span');
  dot.className = 'badge-dot';
  badge.appendChild(dot);
  badge.appendChild(document.createTextNode(STATE_LABEL[state]));
  head.appendChild(badge);

  const task = document.createElement('div');
  task.className = 'card-task';
  task.textContent = agent.task || '—';

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const logs = normalizeLogs(agent.logs);
  foot.innerHTML =
    `<span>${logs.length} log</span><span class="chevron">detay ›</span>`;

  card.appendChild(head);
  card.appendChild(task);
  card.appendChild(foot);

  const key = agentKey(agent, idx);
  card.addEventListener('click', () => openDetail(key));
  return card;
}

function pickManager(agents) {
  const idx = agents.findIndex((a) => {
    const role = String(a.role || '').toLowerCase();
    const name = String(a.name || '').toLowerCase();
    return role === 'manager' || /müdür|mudur|manager/.test(name);
  });
  if (idx === -1) return { manager: null, managerIdx: -1, rest: agents.map((a, i) => ({ a, i })) };
  const rest = agents.map((a, i) => ({ a, i })).filter((x) => x.i !== idx);
  return { manager: agents[idx], managerIdx: idx, rest };
}

// ---- Footer istatistikleri --------------------------------------------------
function renderStats(agents) {
  const counts = { working: 0, waiting: 0, done: 0, stuck: 0 };
  for (const a of agents) counts[normalizeState(a.state)]++;
  const items = [
    ['working', counts.working, 'çalışıyor'],
    ['waiting', counts.waiting, 'bekliyor'],
    ['done', counts.done, 'bitti'],
    ['stuck', counts.stuck, 'takıldı'],
  ];
  const colorVar = {
    working: 'var(--state-working)',
    waiting: 'var(--state-waiting)',
    done: 'var(--state-done)',
    stuck: 'var(--state-stuck)',
  };
  el.footerStats.innerHTML = items
    .map(
      ([k, n, label]) =>
        `<span class="fs" style="--c:${colorVar[k]}">${n} ${label}</span>`
    )
    .join('');
}

// ---- Ekranı çiz -------------------------------------------------------------
function render(data) {
  lastData = data;
  el.projectName.textContent = data.project_name || '—';

  const parsed = data.started_at ? Date.parse(data.started_at) : NaN;
  startedAtMs = isNaN(parsed) ? null : parsed;
  tickTimer();

  const agents = Array.isArray(data.agents) ? data.agents : [];
  const { manager, managerIdx, rest } = pickManager(agents);

  el.managerSlot.innerHTML = '';
  if (manager) {
    el.managerSlot.appendChild(createCard(manager, managerIdx, { isManager: true }));
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'card manager-card state-waiting';
    placeholder.style.cursor = 'default';
    placeholder.innerHTML =
      '<div class="card-head"><div><div class="card-name">Müdür</div>' +
      '<div class="card-role">Müdür</div></div></div>' +
      '<div class="card-task">Müdür atanmadı (role: "manager" ekle)</div>';
    el.managerSlot.appendChild(placeholder);
  }

  el.agentsGrid.innerHTML = '';
  if (rest.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Gösterilecek agent yok.';
    el.agentsGrid.appendChild(hint);
  } else {
    for (const { a, i } of rest) el.agentsGrid.appendChild(createCard(a, i));
  }

  renderStats(agents);

  const upd = data.updated_at ? new Date(data.updated_at) : new Date();
  el.lastUpdated.textContent =
    'son güncelleme: ' + (isNaN(upd) ? '—' : upd.toLocaleString('tr-TR'));

  // Açık detay panelini canlı tazele
  if (openAgentKey) refreshDetail();
}

// ---- Detay / log paneli -----------------------------------------------------
function findAgentByKey(key) {
  if (!lastData || !Array.isArray(lastData.agents)) return null;
  const idx = lastData.agents.findIndex((a, i) => agentKey(a, i) === key);
  return idx === -1 ? null : lastData.agents[idx];
}

function refreshDetail() {
  const agent = findAgentByKey(openAgentKey);
  if (!agent) return; // agent kaybolduysa paneli açık bırak, veri değişmesin
  const state = normalizeState(agent.state);

  el.detailName.textContent = agent.name || 'İsimsiz agent';
  const isManager =
    String(agent.role || '').toLowerCase() === 'manager' ||
    /müdür|mudur|manager/i.test(agent.name || '');
  el.detailRole.textContent = isManager ? 'MÜDÜR' : 'AGENT';

  el.detailBadge.className = 'badge';
  el.detail.className = el.detail.className
    .replace(/state-\w+/g, '')
    .trim();
  el.detail.classList.add(`state-${state}`);
  // rozetin rengi state-* sınıfından geliyor; paneli sarmalayan state-* ekledik
  el.detailStateLabel.textContent = STATE_LABEL[state];

  el.detailTask.textContent = agent.task || '—';

  const logs = normalizeLogs(agent.logs);
  if (logs.length === 0) {
    el.detailLog.innerHTML = '<div class="log-empty">— log kaydı yok —</div>';
  } else {
    el.detailLog.innerHTML = logs
      .map(
        (l) =>
          `<div class="log-line">${
            l.time ? `<span class="log-time">${escapeHtml(l.time)}</span>` : ''
          }<span class="log-msg">${escapeHtml(l.msg)}</span></div>`
      )
      .join('');
  }
}

function openDetail(key) {
  openAgentKey = key;
  refreshDetail();
  el.detail.classList.remove('hidden');
  el.detail.setAttribute('aria-hidden', 'false');
  el.overlay.classList.remove('hidden');
}

function closeDetail() {
  openAgentKey = null;
  el.detail.classList.add('hidden');
  el.detail.setAttribute('aria-hidden', 'true');
  el.overlay.classList.add('hidden');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- Oturum keşfi -----------------------------------------------------------
const ACTIVE_WINDOW_SEC = 60;

function formatAge(sec) {
  if (sec < 60) return sec + ' sn önce';
  if (sec < 3600) return Math.floor(sec / 60) + ' dk önce';
  if (sec < 86400) return Math.floor(sec / 3600) + ' sa önce';
  return Math.floor(sec / 86400) + ' g önce';
}

// lastActivity (ms) üzerinden "şimdi"ye göre canlı yaş
function ageSecOf(s) {
  return Math.max(0, Math.floor((Date.now() - s.lastActivity) / 1000));
}

function renderSessionsHeader() {
  const active = lastSessions.filter((s) => ageSecOf(s) <= ACTIVE_WINDOW_SEC);
  el.sessionsCount.textContent = String(active.length);
  el.sessionsDot.classList.toggle('live', active.length > 0);
}

function renderSessionsList() {
  el.sessionsSub.textContent =
    lastSessions.length + ' oturum bulundu';
  if (lastSessions.length === 0) {
    el.sessionsList.innerHTML =
      '<div class="log-empty">Hiç oturum bulunamadı.</div>';
    return;
  }
  el.sessionsList.innerHTML = lastSessions
    .map((s) => {
      const age = ageSecOf(s);
      const live = age <= ACTIVE_WINDOW_SEC;
      return (
        `<div class="sess${live ? ' live' : ''}">` +
        `<div class="sess-top">` +
        `<span class="sess-dot"></span>` +
        `<span class="sess-proj">${escapeHtml(s.project || '—')}</span>` +
        `<span class="sess-age">${live ? '🟢 ' : ''}${formatAge(age)}</span>` +
        `</div>` +
        (s.cwd ? `<div class="sess-cwd">${escapeHtml(s.cwd)}</div>` : '') +
        `<div class="sess-meta">` +
        `<span><span class="k">id</span> ${escapeHtml(s.sessionId.slice(0, 8))}</span>` +
        (s.gitBranch ? `<span><span class="k">branch</span> ${escapeHtml(s.gitBranch)}</span>` : '') +
        `<span><span class="k">boyut</span> ${s.sizeKB} KB</span>` +
        `</div>` +
        `</div>`
      );
    })
    .join('');
}

async function refreshSessions() {
  const res = await window.api.listSessions();
  if (!res || !res.ok) {
    lastSessions = [];
    el.sessionsCount.textContent = '0';
    el.sessionsDot.classList.remove('live');
    el.sessionsSub.textContent = 'okunamadı';
    el.sessionsList.innerHTML =
      '<div class="log-empty">' +
      escapeHtml((res && res.error) || '~/.claude/projects okunamadı') +
      '</div>';
    return;
  }
  lastSessions = res.sessions || [];
  if (res.activeWindowSec) el.sessionsWindow.textContent = res.activeWindowSec;
  el.sessionsDir.textContent = res.dir || '';
  renderSessionsHeader();
  if (!el.sessionsPanel.classList.contains('hidden')) renderSessionsList();
}

// yaşları saniyede bir tazele (dosya taraması olmadan akıcı görünsün)
setInterval(() => {
  renderSessionsHeader();
  if (!el.sessionsPanel.classList.contains('hidden')) renderSessionsList();
}, 1000);

function openSessions() {
  renderSessionsList();
  el.sessionsPanel.classList.remove('hidden');
  el.sessionsPanel.setAttribute('aria-hidden', 'false');
  el.sessionsOverlay.classList.remove('hidden');
}
function closeSessions() {
  el.sessionsPanel.classList.add('hidden');
  el.sessionsPanel.setAttribute('aria-hidden', 'true');
  el.sessionsOverlay.classList.add('hidden');
}

// ---- Banner ----------------------------------------------------------------
function showBanner(msg) {
  el.banner.textContent = msg;
  el.banner.classList.remove('hidden');
}
function hideBanner() {
  el.banner.classList.add('hidden');
}

function setPathLabel(p) {
  el.statusPath.textContent = p || 'seçilmedi';
  el.statusPath.title = p || '';
}

// ---- Tema -------------------------------------------------------------------
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'hacker';
  el.root.setAttribute('data-theme', t);
  try {
    localStorage.setItem('theme', t);
  } catch {}
  el.btnTheme.title = t === 'hacker' ? 'Açık temaya geç' : 'Hacker temasına geç';
}
function toggleTheme() {
  const cur = el.root.getAttribute('data-theme');
  applyTheme(cur === 'hacker' ? 'light' : 'hacker');
}

// ---- Yükleme döngüsü --------------------------------------------------------
async function refresh() {
  const res = await window.api.readStatus();
  setPathLabel(res.path);
  if (res.ok) {
    hideBanner();
    render(res.data);
  } else {
    showBanner('⚠ ' + res.error);
  }
}

// ---- Olaylar ----------------------------------------------------------------
el.btnSettings.addEventListener('click', () =>
  el.settingsPanel.classList.toggle('hidden')
);
el.btnTheme.addEventListener('click', toggleTheme);
el.btnChoose.addEventListener('click', async () => {
  const r = await window.api.chooseStatusFile();
  setPathLabel(r.statusPath);
  refresh();
});
el.btnReload.addEventListener('click', refresh);
el.detailClose.addEventListener('click', closeDetail);
el.overlay.addEventListener('click', closeDetail);
el.btnSessions.addEventListener('click', openSessions);
el.sessionsClose.addEventListener('click', closeSessions);
el.sessionsOverlay.addEventListener('click', closeSessions);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetail();
    closeSessions();
  }
});

window.api.onConfigChanged((cfg) => {
  setPathLabel(cfg.statusPath);
  refresh();
});
window.api.onForceRefresh(() => refresh());

// ---- Başlat -----------------------------------------------------------------
(async function init() {
  let saved = 'hacker';
  try {
    saved = localStorage.getItem('theme') || 'hacker';
  } catch {}
  applyTheme(saved);

  const cfg = await window.api.getConfig();
  setPathLabel(cfg.statusPath);
  await refresh();
  await refreshSessions();
  setInterval(refresh, POLL_MS);
  setInterval(refreshSessions, POLL_MS);
})();
