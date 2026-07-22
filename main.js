'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { listSessions } = require('./tools/sessions');

// --- Ayarların (config) saklanacağı yer -------------------------------------
// Kullanıcının seçtiği status.json yolunu userData altında tutuyoruz ki
// uygulama kapanıp açıldığında hatırlansın.
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'settings.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH(), 'utf8');
    const cfg = JSON.parse(raw);
    return { statusPath: cfg.statusPath || null };
  } catch {
    // İlk açılışta ayar dosyası yok — proje içindeki örnek status.json'a düş.
    const fallback = path.join(__dirname, 'status.json');
    return { statusPath: fs.existsSync(fallback) ? fallback : null };
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.error('Ayar kaydedilemedi:', err);
  }
}

let config = { statusPath: null };
let mainWindow = null;

// --- status.json okuma -------------------------------------------------------
function readStatus() {
  if (!config.statusPath) {
    return { ok: false, error: 'Henüz bir status.json seçilmedi.', path: null };
  }
  try {
    const raw = fs.readFileSync(config.statusPath, 'utf8');
    const data = JSON.parse(raw);
    return { ok: true, data, path: config.statusPath };
  } catch (err) {
    const reason =
      err.code === 'ENOENT'
        ? 'Dosya bulunamadı: ' + config.statusPath
        : 'status.json okunamadı/çözümlenemedi: ' + err.message;
    return { ok: false, error: reason, path: config.statusPath };
  }
}

// --- Dosya seçimi ------------------------------------------------------------
async function chooseStatusFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'status.json dosyasını seç',
    properties: ['openFile'],
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Tüm dosyalar', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { changed: false, statusPath: config.statusPath };
  }
  config.statusPath = result.filePaths[0];
  saveConfig(config);
  if (mainWindow) mainWindow.webContents.send('config-changed', config);
  return { changed: true, statusPath: config.statusPath };
}

// --- Menü --------------------------------------------------------------------
function buildMenu() {
  const template = [
    {
      label: 'Dosya',
      submenu: [
        {
          label: 'status.json Seç…',
          accelerator: 'CmdOrCtrl+O',
          click: () => chooseStatusFile(),
        },
        {
          label: 'Yeniden Yükle',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('force-refresh');
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Çıkış' },
      ],
    },
    {
      label: 'Görünüm',
      submenu: [
        { role: 'togglefullscreen', label: 'Tam Ekran' },
        { role: 'toggleDevTools', label: 'Geliştirici Araçları' },
        { role: 'resetZoom', label: 'Yakınlaştırmayı Sıfırla' },
        { role: 'zoomIn', label: 'Yakınlaştır' },
        { role: 'zoomOut', label: 'Uzaklaştır' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Pencere -----------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#f4f6fb',
    title: 'Agent Dashboard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// --- IPC ---------------------------------------------------------------------
ipcMain.handle('read-status', () => readStatus());
ipcMain.handle('get-config', () => config);
ipcMain.handle('choose-status-file', () => chooseStatusFile());
ipcMain.handle('list-sessions', () => {
  try {
    return listSessions();
  } catch (err) {
    return { ok: false, error: err.message, sessions: [], activeCount: 0 };
  }
});

// --- Yaşam döngüsü -----------------------------------------------------------
app.whenReady().then(() => {
  config = loadConfig();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
