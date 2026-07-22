'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Renderer'a yalnızca güvenli, sınırlı bir API açıyoruz (contextIsolation açık).
contextBridge.exposeInMainWorld('api', {
  readStatus: () => ipcRenderer.invoke('read-status'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  chooseStatusFile: () => ipcRenderer.invoke('choose-status-file'),
  listSessions: () => ipcRenderer.invoke('list-sessions'),

  // Ana süreçten gelen olaylar
  onConfigChanged: (cb) =>
    ipcRenderer.on('config-changed', (_e, cfg) => cb(cfg)),
  onForceRefresh: (cb) => ipcRenderer.on('force-refresh', () => cb()),
});
