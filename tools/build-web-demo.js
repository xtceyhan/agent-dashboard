'use strict';

/* build-web-demo.js — renderer'ı tek dosyalık, tarayıcıda açılabilen
   canlı bir demoya (docs/demo.html) paketler. Electron API'si yerine
   tarayıcıda çalışan sahte bir window.api ve status.json simülasyonu ekler.
   Kullanım: node tools/build-web-demo.js */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const status = JSON.parse(read('status.json'));
const html = read('renderer/index.html');
const css = read('renderer/styles.css');
const js = read('renderer/renderer.js');

const mock = `
(() => {
  const status = ${JSON.stringify(status)};
  const TASKS = {
    'Backend Agent': ['REST API uç noktalarını yazıyor', 'Auth middleware ekliyor', 'Hata yakalamayı düzenliyor'],
    'Frontend Agent': ['Masraf listesi ekranını tasarlıyor', 'State yönetimini kuruyor', 'Form doğrulamasını ekliyor'],
    'DB Agent': ['Şema migrasyonlarını yazıyor', 'İndeksleri optimize ediyor', 'Seed verisi ekliyor'],
    'Test Agent': ['Birim testleri yazıyor', 'E2E senaryolarını kuruyor', 'Coverage raporu üretiyor'],
    'Docs Agent': ['README taslağı hazırlıyor', 'API dokümanını yazıyor', 'Changelog düzenliyor'],
  };
  const STATES = ['working', 'waiting', 'done', 'stuck'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const iso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  status.started_at = iso();
  setInterval(() => {
    const workers = status.agents.filter((a) => a.role !== 'manager' && TASKS[a.name]);
    if (!workers.length) return;
    const a = pick(workers);
    a.state = pick(STATES);
    a.task = pick(TASKS[a.name]);
    a.logs.push({ time: iso(), message: '[' + a.state + '] ' + a.task });
    status.updated_at = iso();
  }, 2500);
  const cfg = { statusPath: 'demo/status.json (simülasyon)' };
  window.api = {
    readStatus: async () => ({ ok: true, data: status, path: cfg.statusPath }),
    getConfig: async () => cfg,
    chooseStatusFile: async () => ({ changed: false, statusPath: cfg.statusPath }),
    listSessions: async () => ({ ok: true, sessions: [], activeCount: 1 }),
    onConfigChanged: () => {},
    onForceRefresh: () => {},
  };
})();
`;

const out = html
  .replace(/<meta[^>]*Content-Security-Policy[\s\S]*?\/>/, '')
  .replace(/<link rel="stylesheet" href="styles.css" \/>/, () => `<style>${css}</style>`)
  .replace(/<script src="renderer.js"><\/script>/, () => `<script>${mock}</script>\n<script>${js}</script>`);

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'demo.html'), out);
console.log('docs/demo.html yazıldı (' + out.length + ' bayt)');
