/**
 * server.js  –  Express backend
 * Handles: recording control, meeting CRUD, screenshot scheduling.
 * Forwards pipeline events → Electron IPC via global.mainWindow references.
 *
 * Start with:  node backend/server.js
 * (Electron main.js spawns this automatically – see ipcMain handlers)
 */
const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.on('uncaughtException', (err) => {
  console.error('[Backend] Uncaught Exception (ignoring to prevent crash):', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Backend] Unhandled Rejection:', reason);
});

const { connectDB }    = require('../db/connect');
const { Meeting, Task } = require('../db/models');
const pipeline         = require('../ai/pipeline');

const app  = express();
const PORT = process.env.BACKEND_PORT || 3001;

app.use(cors());
app.use(express.json());

// Middleware for raw binary audio chunks
app.use('/audio', express.raw({ type: 'application/octet-stream', limit: '10mb' }));

app.post('/audio', async (req, res) => {
  if (pipeline.isRunning) {
    pipeline.handleAudioChunk(req.body);
  }
  res.send({ success: true });
});

app.post('/transcript', (req, res) => {
  try {
    const { text } = req.body;
    if (pipeline.isRunning && text) {
      pipeline.handleTranscript(text);
    }
    res.send({ success: true });
  } catch (err) {
    console.error('[Backend] Transcript error:', err);
    res.status(500).send({ error: 'failed' });
  }
});

// ── In-memory state (fallback when DB is unavailable) ─────────────────────────
let activeMeetingId = null;
let inMemoryTasks   = [];
let inMemoryTranscript = '';

// ── DB (optional) ─────────────────────────────────────────────────────────────
connectDB();

// ── Pipeline event callbacks → SSE broadcast ──────────────────────────────────
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch (_) { sseClients.delete(res); }
  }
}

// Pipe pipeline events to SSE (renderer listens via EventSource)
pipeline.on('transcript', (data) => {
  inMemoryTranscript += ' ' + data.text;
  broadcast('transcript', data);
});
pipeline.on('task', async (data) => {
  inMemoryTasks.push(data);
  broadcast('task', data);
  // Persist to DB if available and meeting is active
  if (activeMeetingId) {
    try {
      const t = await Task.create({ ...data, meetingId: activeMeetingId });
      await Meeting.findByIdAndUpdate(activeMeetingId, { $push: { tasks: t._id } });
    } catch (_) {}
  }
});
pipeline.on('summary', (data) => broadcast('summary', data));
pipeline.on('error', (err) => {
  console.error('[Pipeline Error]:', err.message);
  broadcast('error', { message: err.message });
});

// ── SSE endpoint ──────────────────────────────────────────────────────────────
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── Recording control ─────────────────────────────────────────────────────────
app.post('/recording/start', async (req, res) => {
  const { title = 'New Meeting' } = req.body;

  // Create meeting doc
  try {
    const meeting = await Meeting.create({ title });
    activeMeetingId = meeting._id;
  } catch (_) {
    activeMeetingId = null;
  }

  inMemoryTasks = [];
  inMemoryTranscript = '';
  pipeline.start();
  broadcast('status', { recording: true });
  res.json({ ok: true, meetingId: activeMeetingId });
});

app.post('/recording/stop', async (req, res) => {
  const result = await pipeline.stop();
  broadcast('status', { recording: false });

  if (activeMeetingId) {
    try {
      await Meeting.findByIdAndUpdate(activeMeetingId, {
        transcript: result.transcript,
        summary:    result.summary,
        endedAt:    new Date(),
        status:     'completed',
      });
    } catch (_) {}
  }

  res.json({ 
    ok: true, 
    transcript: result?.transcript || inMemoryTranscript.trim(), 
    summary: result?.summary || '' 
  });
  activeMeetingId = null;
});

// ── Meetings ──────────────────────────────────────────────────────────────────
app.get('/meetings', async (_req, res) => {
  try {
    const meetings = await Meeting.find().sort({ startedAt: -1 }).limit(20);
    res.json(meetings);
  } catch (_) {
    res.json([]);
  }
});

app.get('/meetings/:id', async (req, res) => {
  try {
    const m = await Meeting.findById(req.params.id).populate('tasks');
    res.json(m);
  } catch (_) {
    res.status(404).json({ error: 'not found' });
  }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get('/tasks', async (_req, res) => {
  try {
    const tasks = await Task.find().sort({ timestamp: -1 }).limit(50);
    res.json(tasks);
  } catch (_) {
    res.json(inMemoryTasks);
  }
});

app.patch('/tasks/:id', async (req, res) => {
  try {
    const t = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(t);
  } catch (_) {
    res.status(404).json({ error: 'not found' });
  }
});

// ── Screenshots ───────────────────────────────────────────────────────────────
app.post('/screenshots', async (req, res) => {
  const { filePath } = req.body;
  if (activeMeetingId && filePath) {
    try {
      await Meeting.findByIdAndUpdate(activeMeetingId, { $push: { screenshots: filePath } });
    } catch (_) {}
  }
  res.json({ ok: true });
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`[Backend] running on http://localhost:${PORT}`));

module.exports = app;
