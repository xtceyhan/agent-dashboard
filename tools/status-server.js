'use strict';

/* ============================================================
   status-server — bir makinedeki status.json'ı Tailscale ağı
   üzerinden diğer makinelere (Dashboard Server'a) sunan minik,
   bağımlılıksız bir HTTP servisi.

   Kullanım:
     node tools/status-server.js [status.json yolu] [port]

   Ortam değişkenleri (opsiyonel):
     STATUS_FILE, STATUS_PORT, STATUS_BIND_HOST

   Güvenlik notu: sunucu varsayılan olarak yalnızca bu makinenin
   Tailscale IP'sine bağlanır (`tailscale ip -4` ile bulunur) —
   yani sadece aynı tailnet'teki cihazlar erişebilir. Tailscale
   bulunamazsa 127.0.0.1'e düşer ve uyarı basar; dışarıya açık
   0.0.0.0 asla otomatik seçilmez.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const filePath = path.resolve(process.argv[2] || process.env.STATUS_FILE || 'status.json');
const port = Number(process.argv[3] || process.env.STATUS_PORT || 4317);

function detectBindHost() {
  if (process.env.STATUS_BIND_HOST) return process.env.STATUS_BIND_HOST;
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
    '[status-server] Tailscale IP bulunamadı, sadece 127.0.0.1 üzerinden yayınlanıyor. ' +
      'Diğer cihazlardan erişim için STATUS_BIND_HOST ortam değişkenini tailnet IP\'ne ayarla.'
  );
  return '127.0.0.1';
}

const bindHost = detectBindHost();

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end();
    return;
  }
  if (req.url === '/api/status' || req.url === '/status.json') {
    fs.readFile(filePath, 'utf8', (err, raw) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ project_name: '', started_at: null, updated_at: null, agents: [] }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(raw);
    });
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  res.writeHead(404).end();
});

server.listen(port, bindHost, () => {
  console.log(`[status-server] ${filePath}`);
  console.log(`[status-server] http://${bindHost}:${port}/api/status adresinde yayında`);
});
