const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer (no direct Node access)
contextBridge.exposeInMainWorld('electronAPI', {
  // Recording controls
  startRecording: () => ipcRenderer.send('start-recording'),
  stopRecording:  () => ipcRenderer.send('stop-recording'),

  // Overlay
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  setOverlayInteractive: (interactive) => ipcRenderer.send('overlay-interactive', interactive),

  // Screenshot
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),

  // Event listeners (renderer subscribes)
  onTranscriptUpdate: (cb) => {
    ipcRenderer.on('transcript-update', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('transcript-update');
  },
  onTaskDetected: (cb) => {
    ipcRenderer.on('task-detected', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('task-detected');
  },
  onSummaryUpdate: (cb) => {
    ipcRenderer.on('summary-update', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('summary-update');
  },
  onRecordingStatus: (cb) => {
    ipcRenderer.on('recording-status', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('recording-status');
  },

  // Overlay drag
  overlayDrag: (dx, dy) => ipcRenderer.send('overlay-drag', { dx, dy }),

  // Backend HTTP helpers (called from renderer via preload to avoid CORS)
  sendToBackend: (path, body) =>
    ipcRenderer.invoke('backend-request', { path, body }),
});
