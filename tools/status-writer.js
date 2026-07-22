'use strict';

/* ============================================================
   StatusWriter — status.json'ı güvenli (atomik) şekilde
   güncelleyen küçük bir yardımcı.

   Hem kütüphane hem CLI olarak kullanılabilir.

   Kütüphane:
     const StatusWriter = require('./tools/status-writer');
     const w = new StatusWriter('C:/proj/status.json');
     w.init('masraf_takip');                       // dosyayı oluştur/proje adı + started_at
     w.setAgent('Müdür', { role: 'manager', state: 'working', task: 'Dağıtıyor' });
     w.setAgent('Backend', { state: 'working', task: 'API yazıyor' });
     w.log('Backend', 'GET /expenses eklendi');    // ilgili agent'a log satırı
     w.remove('Backend');                          // agent'ı sil

   CLI:
     node tools/status-writer.js <file> init "<proje adı>"
     node tools/status-writer.js <file> set <agent> <state> "<görev>" [--role manager]
     node tools/status-writer.js <file> log <agent> "<mesaj>"
     node tools/status-writer.js <file> rm  <agent>
   ============================================================ */

const fs = require('fs');
const path = require('path');

const MAX_LOGS = 200; // agent başına saklanacak en fazla log satırı

class StatusWriter {
  constructor(filePath) {
    if (!filePath) throw new Error('status.json yolu gerekli');
    this.filePath = path.resolve(filePath);
  }

  _read() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return { project_name: '', started_at: null, updated_at: null, agents: [] };
    }
  }

  // Atomik yazma: geçici dosyaya yaz, sonra yerine taşı.
  _write(data) {
    data.updated_at = new Date().toISOString();
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.status.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
    return data;
  }

  _findIndex(data, name) {
    const n = String(name).toLowerCase();
    return data.agents.findIndex((a) => String(a.name).toLowerCase() === n);
  }

  /** Dosyayı oluşturur / proje adını ve başlangıç zamanını ayarlar. */
  init(projectName, startedAt) {
    const data = this._read();
    if (projectName) data.project_name = projectName;
    if (!data.started_at) data.started_at = startedAt || new Date().toISOString();
    if (!Array.isArray(data.agents)) data.agents = [];
    return this._write(data);
  }

  /** Agent ekler ya da var olanı günceller (kısmi alan güncellemesi). */
  setAgent(name, fields = {}) {
    const data = this._read();
    const idx = this._findIndex(data, name);
    if (idx === -1) {
      data.agents.push({ name, task: '', state: 'waiting', logs: [], ...fields });
    } else {
      data.agents[idx] = { ...data.agents[idx], ...fields, name };
    }
    return this._write(data);
  }

  /** Yalnızca durumu değiştirir. */
  setState(name, state) {
    return this.setAgent(name, { state });
  }

  /** İlgili agent'a zaman damgalı bir log satırı ekler. */
  log(name, message) {
    const data = this._read();
    const idx = this._findIndex(data, name);
    if (idx === -1) throw new Error(`Agent bulunamadı: ${name}`);
    const a = data.agents[idx];
    if (!Array.isArray(a.logs)) a.logs = [];
    a.logs.push({ time: new Date().toISOString(), message });
    if (a.logs.length > MAX_LOGS) a.logs = a.logs.slice(-MAX_LOGS);
    return this._write(data);
  }

  /** Agent'ı siler. */
  remove(name) {
    const data = this._read();
    data.agents = data.agents.filter(
      (a) => String(a.name).toLowerCase() !== String(name).toLowerCase()
    );
    return this._write(data);
  }
}

module.exports = StatusWriter;

// ---- CLI --------------------------------------------------------------------
if (require.main === module) {
  const [, , file, cmd, ...rest] = process.argv;
  if (!file || !cmd) {
    console.log(
      [
        'Kullanım:',
        '  node tools/status-writer.js <file> init "<proje adı>"',
        '  node tools/status-writer.js <file> set <agent> <state> "<görev>" [--role manager]',
        '  node tools/status-writer.js <file> log <agent> "<mesaj>"',
        '  node tools/status-writer.js <file> rm  <agent>',
      ].join('\n')
    );
    process.exit(1);
  }
  const w = new StatusWriter(file);
  try {
    switch (cmd) {
      case 'init':
        w.init(rest[0] || 'proje');
        console.log('init OK →', file);
        break;
      case 'set': {
        const [name, state, task] = rest;
        const roleIdx = rest.indexOf('--role');
        const fields = { state, task: task || '' };
        if (roleIdx !== -1 && rest[roleIdx + 1]) fields.role = rest[roleIdx + 1];
        w.setAgent(name, fields);
        console.log(`set OK → ${name} [${state}]`);
        break;
      }
      case 'log':
        w.log(rest[0], rest.slice(1).join(' '));
        console.log(`log OK → ${rest[0]}`);
        break;
      case 'rm':
        w.remove(rest[0]);
        console.log(`rm OK → ${rest[0]}`);
        break;
      default:
        console.error('Bilinmeyen komut:', cmd);
        process.exit(1);
    }
  } catch (err) {
    console.error('Hata:', err.message);
    process.exit(1);
  }
}
