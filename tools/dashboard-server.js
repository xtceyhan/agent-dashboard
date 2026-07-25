'use strict';

/* ============================================================
   dashboard-server — birden fazla Tailscale cihazındaki
   status-server'ları toplayıp tek bir mobil/tablet uyumlu web
   sayfasında gösteren toplayıcı.

   Kullanım:
     node tools/dashboard-server.js [devices.json yolu] [port]

   devices.json:
     [{ "name": "Ofis PC", "host": "ofis-pc.tailxxxx.ts.net", "port": 4317 }]

   Tabletten erişim: aynı tailnet'teki herhangi bir cihazın
   tarayıcısından  http://<bu-makinenin-tailscale-ip>:PORT
   adresini aç.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const devicesPath = path.resolve(process.argv[2] || process.env.DEVICES_FILE || 'devices.json');
const port = Number(process.argv[3] || process.env.DASHBOARD_PORT || 4300);
const FETCH_TIMEOUT_MS = 3000;

function detectBindHost() {
  if (process.env.DASHBOARD_BIND_HOST) return process.env.DASHBOARD_BIND_HOST;
  try {
    const ip = execSync('tailscale ip -4', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .split('\n')[0];
    if (ip) return ip;
  } catch {
    /* tailscale bulunamadı */
  }
  console.warn(
    '[dashboard-server] Tailscale IP bulunamadı, sadece 127.0.0.1 üzerinden yayınlanıyor — ' +
      'tabletten erişim için DASHBOARD_BIND_HOST ortam değişkenini tailnet IP\'ne ayarla.'
  );
  return '127.0.0.1';
}

const bindHost = detectBindHost();

function loadDevices() {
  try {
    const raw = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function fetchDevice(dev) {
  const url = `http://${dev.host}:${dev.port || 4317}/api/status`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ...dev, online: true, error: null, ...data };
  } catch (err) {
    return { ...dev, online: false, error: err.message, agents: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function getSnapshot() {
  const devices = loadDevices();
  const results = await Promise.all(devices.map(fetchDevice));
  return results;
}

const PAGE = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Agent Dashboard — Cihazlar</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0b0f14; color: #d7e2ea; -webkit-tap-highlight-color: transparent;
  }
  header {
    padding: 16px 18px; border-bottom: 1px solid #1c2530; position: sticky; top: 0;
    background: #0b0f14; z-index: 5; display: flex; align-items: center; justify-content: space-between;
  }
  header h1 { font-size: 1.1rem; margin: 0; letter-spacing: .02em; }
  header .refresh { font-size: .78rem; color: #6c7f91; }
  main { padding: 14px; max-width: 1100px; margin: 0 auto; }
  .devices {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px;
  }
  .device-card {
    background: #121924; border: 1px solid #22303f; border-radius: 12px; padding: 14px;
    cursor: pointer; user-select: none; transition: border-color .15s;
  }
  .device-card:active { border-color: #3d5a75; }
  .device-card.open { border-color: #4fd1ff; }
  .device-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .device-name { font-weight: 600; font-size: 1rem; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .dot.online { background: #3ecf6a; box-shadow: 0 0 6px #3ecf6a; }
  .dot.offline { background: #555; }
  .device-project { color: #8ea3b5; font-size: .82rem; margin-top: 4px; }
  .device-counts { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .pill { font-size: .72rem; padding: 2px 8px; border-radius: 999px; border: 1px solid #2a3a4a; }
  .pill.working { color: #ffd75e; border-color: #4a4324; }
  .pill.waiting { color: #9fb3c4; border-color: #2a3a4a; }
  .pill.done { color: #4fe08a; border-color: #234a34; }
  .pill.stuck { color: #ff6b6b; border-color: #4a2424; }
  .agents { margin-top: 12px; display: none; flex-direction: column; gap: 8px; }
  .device-card.open .agents { display: flex; }
  .agent-row {
    background: #0e141c; border-left: 3px solid #2a3a4a; border-radius: 6px; padding: 8px 10px;
  }
  .agent-row.working { border-color: #ffd75e; }
  .agent-row.waiting { border-color: #6c7f91; }
  .agent-row.done { border-color: #4fe08a; }
  .agent-row.stuck { border-color: #ff6b6b; }
  .agent-name { font-size: .86rem; font-weight: 600; }
  .agent-task { font-size: .78rem; color: #9fb3c4; margin-top: 2px; }
  .empty { color: #6c7f91; padding: 40px 0; text-align: center; }
  .offline-note { color: #ff8080; font-size: .78rem; margin-top: 8px; }
</style>
</head>
<body>
<header>
  <h1>Agent Dashboard</h1>
  <span class="refresh" id="refreshInfo">yükleniyor…</span>
</header>
<main>
  <div class="devices" id="devices"><div class="empty">Yükleniyor…</div></div>
</main>
<script>
const STATE_MAP = {
  working: 'working', çalışıyor: 'working', running: 'working', active: 'working', busy: 'working', in_progress: 'working',
  waiting: 'waiting', bekliyor: 'waiting', idle: 'waiting', queued: 'waiting', pending: 'waiting',
  done: 'done', bitti: 'done', completed: 'done', finished: 'done', success: 'done',
  stuck: 'stuck', takıldı: 'stuck', error: 'stuck', failed: 'stuck', blocked: 'stuck',
};
const STATE_LABEL = { working: 'çalışıyor', waiting: 'bekliyor', done: 'bitti', stuck: 'takıldı' };
function normState(s) { return STATE_MAP[String(s || '').toLowerCase()] || 'waiting'; }

const openSet = new Set();

async function refresh() {
  let devices = [];
  try {
    const res = await fetch('/api/devices');
    devices = await res.json();
  } catch {
    document.getElementById('refreshInfo').textContent = 'bağlantı hatası';
    return;
  }
  render(devices);
  document.getElementById('refreshInfo').textContent = 'güncellendi: ' + new Date().toLocaleTimeString('tr-TR');
}

function render(devices) {
  const root = document.getElementById('devices');
  if (!devices.length) {
    root.innerHTML = '<div class="empty">devices.json içinde tanımlı cihaz yok.</div>';
    return;
  }
  root.innerHTML = '';
  for (const dev of devices) {
    const card = document.createElement('div');
    card.className = 'device-card' + (openSet.has(dev.name) ? ' open' : '');
    const agents = Array.isArray(dev.agents) ? dev.agents : [];
    const counts = { working: 0, waiting: 0, done: 0, stuck: 0 };
    for (const a of agents) counts[normState(a.state)]++;

    const pills = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => \`<span class="pill \${k}">\${STATE_LABEL[k]} \${n}</span>\`)
      .join('');

    const agentRows = agents
      .map((a) => {
        const st = normState(a.state);
        return \`<div class="agent-row \${st}">
          <div class="agent-name">\${escapeHtml(a.name)} <span style="color:#6c7f91;font-weight:400">· \${STATE_LABEL[st]}</span></div>
          <div class="agent-task">\${escapeHtml(a.task || '')}</div>
        </div>\`;
      })
      .join('');

    card.innerHTML = \`
      <div class="device-top">
        <span class="device-name">\${escapeHtml(dev.name)}</span>
        <span class="dot \${dev.online ? 'online' : 'offline'}"></span>
      </div>
      <div class="device-project">\${dev.online ? escapeHtml(dev.project_name || '(proje adı yok)') : 'çevrimdışı / erişilemiyor'}</div>
      <div class="device-counts">\${pills || (dev.online ? '' : '')}</div>
      \${!dev.online ? \`<div class="offline-note">\${escapeHtml(dev.error || '')}</div>\` : ''}
      <div class="agents">\${agentRows || '<div class="empty" style="padding:10px 0">agent yok</div>'}</div>
    \`;
    card.addEventListener('click', () => {
      if (openSet.has(dev.name)) openSet.delete(dev.name);
      else openSet.add(dev.name);
      card.classList.toggle('open');
    });
    root.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') return res.writeHead(405).end();

  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  if (req.url === '/api/devices') {
    const snapshot = await getSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(snapshot));
    return;
  }
  res.writeHead(404).end();
});

server.listen(port, bindHost, () => {
  console.log(`[dashboard-server] cihazlar: ${devicesPath}`);
  console.log(`[dashboard-server] http://<tailscale-ip>:${port} adresinde yayında (tablet dahil, tailnet'teki her cihazdan açılabilir)`);
});
