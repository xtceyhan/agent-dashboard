'use strict';

/* ============================================================
   sessions.js — Claude Code oturumlarını otomatik keşfeder.

   ~/.claude/projects/<proje>/<oturum-id>.jsonl transkriptlerini
   tarar. Bir oturum, transkript dosyası son ACTIVE_WINDOW_MS
   içinde değişmişse "aktif" sayılır (yani yakın zamanda iş yaptı).

   Not: Bu bir *etkinlik* sinyalidir; oturum açık ama boşta
   beklerken dosyaya yazmaz, o yüzden "boşta" görünebilir.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ACTIVE_WINDOW_MS = 60 * 1000; // 60 sn içinde yazıldıysa "aktif"

function projectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Transkriptin başından bir miktar okuyup cwd/gitBranch/version taşıyan
// ilk satırı bul (genelde 4. satır civarı). Tüm dosyayı okumaya gerek yok.
function readMeta(file) {
  const meta = { cwd: null, gitBranch: null, version: null };
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const text = buf.toString('utf8', 0, n);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // yarım kalan son satır olabilir
      }
      if (obj.cwd && !meta.cwd) meta.cwd = obj.cwd;
      if (obj.gitBranch && !meta.gitBranch) meta.gitBranch = obj.gitBranch;
      if (obj.version && !meta.version) meta.version = obj.version;
      if (meta.cwd) break; // cwd'yi bulduk, yeter
    }
  } catch {
    /* okunamadı — meta boş kalır */
  }
  return meta;
}

function projectName(cwd, folder) {
  if (cwd) return path.basename(cwd);
  // cwd yoksa klasör adının son parçası (kaba tahmin)
  const parts = folder.split('-').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : folder;
}

function listSessions(nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const dir = projectsDir();

  let folders;
  try {
    folders = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory());
  } catch {
    return {
      ok: false,
      error: '~/.claude/projects bulunamadı: ' + dir,
      dir,
      sessions: [],
      activeCount: 0,
    };
  }

  const sessions = [];
  for (const folder of folders) {
    const pdir = path.join(dir, folder.name);
    let files;
    try {
      files = fs.readdirSync(pdir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const full = path.join(pdir, f);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      const ageMs = now - st.mtimeMs;
      const meta = readMeta(full);
      sessions.push({
        sessionId: f.replace(/\.jsonl$/, ''),
        folder: folder.name,
        cwd: meta.cwd,
        project: projectName(meta.cwd, folder.name),
        gitBranch: meta.gitBranch,
        version: meta.version,
        lastActivity: st.mtimeMs,
        ageSec: Math.max(0, Math.floor(ageMs / 1000)),
        sizeKB: Math.round(st.size / 1024),
        active: ageMs <= ACTIVE_WINDOW_MS,
      });
    }
  }

  sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  return {
    ok: true,
    dir,
    sessions,
    activeCount: sessions.filter((s) => s.active).length,
    activeWindowSec: ACTIVE_WINDOW_MS / 1000,
  };
}

module.exports = { listSessions, ACTIVE_WINDOW_MS };
