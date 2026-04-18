const { app, BrowserWindow, ipcMain, screen, desktopCapturer, session } = require('electron');
const path    = require('path');
const fs      = require('fs');
const { spawn } = require('child_process');
const axios   = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// IMPORTANT: Treat the Vite dev server as a secure origin so MediaDevices API works!
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'http://localhost:5173');

let mainWindow    = null;
let overlayWindow = null;
let backendProc   = null;

const BACKEND_URL   = `http://localhost:${process.env.BACKEND_PORT || 3001}`;
const RENDERER_DEV  = 'http://localhost:5173';
const RENDERER_PROD = path.join(__dirname, '../renderer/dist/index.html');

function isDev() { return !app.isPackaged; }

// ── Spawn backend ─────────────────────────────────────────────────────────────
function startBackend() {
  const serverPath = path.join(__dirname, '../backend/server.js');
  backendProc = spawn('node', [serverPath], {
    env: { ...process.env },
    stdio: 'pipe',
    windowsHide: true,
  });
  
  // Forward stdout/stderr to main process console quietly
  backendProc.stdout.on('data', (d) => console.log(`[Backend] ${d.toString().trim()}`));
  backendProc.stderr.on('data', (d) => console.error(`[Backend] ${d.toString().trim()}`));
  backendProc.on('error', (e) => console.error('[Backend] spawn error:', e));
  backendProc.on('exit', (code) => console.log('[Backend] exited:', code));
}

// ── Subscribe to SSE and forward to renderer windows ─────────────────────────
async function subscribeToBackend() {
  // Wait a moment for the backend to be ready
  await new Promise(r => setTimeout(r, 2000));
  const EventSource = require('./eventSourcePolyfill'); // we'll bundle a small one

  const es = new EventSource(`${BACKEND_URL}/events`);

  es.addEventListener('transcript', (e) => {
    const data = JSON.parse(e.data);
    broadcast('transcript-update', data);
  });
  es.addEventListener('task', (e) => {
    const data = JSON.parse(e.data);
    broadcast('task-detected', data);
  });
  es.addEventListener('summary', (e) => {
    const data = JSON.parse(e.data);
    broadcast('summary-update', data);
  });
  es.addEventListener('status', (e) => {
    const data = JSON.parse(e.data);
    broadcast('recording-status', data);
  });
}

function broadcast(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send(channel, data);
  if (overlayWindow && !overlayWindow.isDestroyed())
    overlayWindow.webContents.send(channel, data);
}

// ── Main Window ───────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0e10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev()) {
    mainWindow.loadURL(RENDERER_DEV);
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(RENDERER_PROD);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow) overlayWindow.close();
  });
}

// ── Overlay Window ────────────────────────────────────────────────────────────
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Enable click-through by default so the rest of the OS is clickable!
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  if (isDev()) {
    // CRITICAL FIX: load in overlayWindow, not mainWindow!
    overlayWindow.loadURL(`${RENDERER_DEV}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/dist/overlay.html'));
  }

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.on('toggle-overlay', () => {
  if (!overlayWindow) { createOverlayWindow(); return; }
  overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
});

ipcMain.on('overlay-interactive', (_, interactive) => {
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(!interactive, { forward: true });
  }
});

ipcMain.on('start-recording', async (_e, payload) => {
  try {
    await axios.post(`${BACKEND_URL}/recording/start`, payload || {});
  } catch (err) {
    console.error('[IPC] start-recording:', err.message);
  }
});

ipcMain.on('stop-recording', async () => {
  try {
    await axios.post(`${BACKEND_URL}/recording/stop`);
  } catch (err) {
    console.error('[IPC] stop-recording:', err.message);
  }
});

ipcMain.handle('capture-screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 },
    });
    if (!sources.length) return null;
    const img = sources[0].thumbnail.toPNG();
    const dir = path.join(app.getPath('userData'), 'screenshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `ss_${Date.now()}.png`);
    fs.writeFileSync(filePath, img);
    // Notify backend to associate with active meeting
    await axios.post(`${BACKEND_URL}/screenshots`, { filePath }).catch(() => {});
    return filePath;
  } catch (err) {
    console.error('[Screenshot]', err.message);
    return null;
  }
});

ipcMain.on('overlay-drag', (_e, { dx, dy }) => {
  if (!overlayWindow) return;
  const [x, y] = overlayWindow.getPosition();
  overlayWindow.setPosition(x + dx, y + dy);
});

ipcMain.on('hide-overlay', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
});

// ── Region capture with visual change detection ───────────────────────────────
let regionCaptureTimer = null;
let previousBitmap = null;
const CHANGE_THRESHOLD = 0.04; // 4% pixel difference triggers capture

ipcMain.on('start-region-capture', (_e, region) => {
  stopRegionCapture();
  previousBitmap = null;
  console.log('[RegionCapture] Monitoring region:', JSON.stringify(region));

  regionCaptureTimer = setInterval(async () => {
    try {
      const display = screen.getPrimaryDisplay();
      const { width, height } = display.size;

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });
      if (!sources.length) return;

      const fullImage = sources[0].thumbnail;
      const cropped = fullImage.crop({
        x: Math.round(region.x),
        y: Math.round(region.y),
        width: Math.round(region.width),
        height: Math.round(region.height),
      });

      const currentBitmap = cropped.toBitmap();

      if (previousBitmap) {
        const changeRatio = compareBitmaps(previousBitmap, currentBitmap);
        if (changeRatio > CHANGE_THRESHOLD) {
          const pngBuffer = cropped.toPNG();
          const dir = path.join(app.getPath('userData'), 'screenshots');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const filePath = path.join(dir, `region_${Date.now()}.png`);
          fs.writeFileSync(filePath, pngBuffer);

          await axios.post(`${BACKEND_URL}/screenshots`, { filePath }).catch(() => {});
          broadcast('region-screenshot', { filePath, timestamp: new Date().toISOString() });
          console.log(`[RegionCapture] Change detected (${(changeRatio * 100).toFixed(1)}%), saved: ${filePath}`);
        }
      }
      previousBitmap = currentBitmap;
    } catch (err) {
      console.error('[RegionCapture] error:', err.message);
    }
  }, 2000);
});

ipcMain.on('stop-region-capture', () => {
  stopRegionCapture();
});

function stopRegionCapture() {
  if (regionCaptureTimer) {
    clearInterval(regionCaptureTimer);
    regionCaptureTimer = null;
    previousBitmap = null;
    console.log('[RegionCapture] Stopped');
  }
}

function compareBitmaps(buf1, buf2) {
  if (buf1.length !== buf2.length) return 1;
  const totalPixels = buf1.length / 4; // RGBA
  const step = Math.max(1, Math.floor(totalPixels / 5000)) * 4;
  let diffCount = 0;
  let sampledPixels = 0;
  for (let i = 0; i < buf1.length; i += step) {
    sampledPixels++;
    const dr = Math.abs(buf1[i] - buf2[i]);
    const dg = Math.abs(buf1[i + 1] - buf2[i + 1]);
    const db = Math.abs(buf1[i + 2] - buf2[i + 2]);
    if (dr + dg + db > 30) diffCount++;
  }
  return diffCount / sampledPixels;
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Enforce secure permissions for React Media Devices (mic and screen)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') {
      callback(true);
    } else {
      callback(false);
    }
  });

  startBackend();
  createMainWindow();
  await subscribeToBackend();
});

app.on('window-all-closed', () => {
  stopRegionCapture();
  if (backendProc) backendProc.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createMainWindow();
});
