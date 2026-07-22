'use strict';

/* ============================================================
   simulate.js — status.json'ı canlı bir Claude Code çalışması
   gibi hareketlendiren demo/simülatör.

   Dashboard'u açıp bunu çalıştırınca agent'ların durumu ve
   log'ları gerçek zamanlı akar — dashboard'un canlılığını test
   etmek için birebir.

   Kullanım:
     node tools/simulate.js [status.json yolu]
   (yol verilmezse proje kökündeki status.json kullanılır)

   Durdurmak için Ctrl+C.
   ============================================================ */

const path = require('path');
const StatusWriter = require('./status-writer');

const file = process.argv[2] || path.join(__dirname, '..', 'status.json');
const w = new StatusWriter(file);

const PROJECT = 'masraf_takip';
const TICK_MS = 1800;

// Simüle edilecek agent'lar ve yapabilecekleri işler
const AGENTS = [
  { name: 'Müdür', role: 'manager', tasks: [
    'Görevleri dağıtıyor', 'İlerlemeyi denetliyor', 'Planı gözden geçiriyor',
    'PR birleştirmeyi onaylıyor',
  ] },
  { name: 'Backend Agent', tasks: [
    'REST API uç noktalarını yazıyor', 'Auth middleware ekliyor',
    'Hata yakalamayı düzenliyor', 'Endpoint testlerini geçiyor',
  ] },
  { name: 'Frontend Agent', tasks: [
    'Masraf listesi ekranını tasarlıyor', 'State yönetimini kuruyor',
    'Form doğrulamasını ekliyor', 'Responsive düzeni ayarlıyor',
  ] },
  { name: 'DB Agent', tasks: [
    'Şema migrasyonlarını yazıyor', 'İndeksleri optimize ediyor',
    'Seed verisi ekliyor', 'Yedekleme scriptini kuruyor',
  ] },
  { name: 'Test Agent', tasks: [
    'Birim testleri yazıyor', 'E2E senaryolarını kuruyor',
    'Coverage raporu üretiyor', 'Flaky testi araştırıyor',
  ] },
  { name: 'Docs Agent', tasks: [
    'README taslağı hazırlıyor', 'API dokümanını yazıyor',
    'Örnekleri güncelliyor', 'Changelog düzenliyor',
  ] },
];

const STATES = ['working', 'waiting', 'done', 'stuck'];
let step = 0;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// İlk kurulum
w.init(PROJECT);
for (const a of AGENTS) {
  w.setAgent(a.name, {
    role: a.role,
    state: a.name === 'Müdür' ? 'working' : 'waiting',
    task: a.tasks[0],
    logs: [],
  });
}
console.log('Simülasyon başladı →', file);
console.log('Dashboard\'u açık tut. Durdurmak için Ctrl+C.\n');

const timer = setInterval(() => {
  step++;
  // Rastgele bir agent'ı hareketlendir
  const a = pick(AGENTS.filter((x) => x.role !== 'manager'));
  const newState = pick(STATES);
  const newTask = pick(a.tasks);

  w.setAgent(a.name, { state: newState, task: newTask });
  w.log(a.name, `[${newState}] ${newTask}`);

  // Müdür ara sıra görev değiştirir
  if (step % 4 === 0) {
    const mTask = pick(AGENTS[0].tasks);
    w.setAgent('Müdür', { state: 'working', task: mTask });
    w.log('Müdür', mTask);
  }

  process.stdout.write(`\rtick ${step}  →  ${a.name}: ${newState}        `);
}, TICK_MS);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nSimülasyon durduruldu.');
  process.exit(0);
});
