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
const { analyzeImage } = require('../ai/imageAnalyzer');
const { removeFiller, extractTopics, extractDecisions, buildTimeline, buildHighlights, deduplicateItems } = require('../ai/dataExtractor');
const { generateStructuredSummary } = require('../ai/summarizer');

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
pipeline.on('open-question', async (data) => {
  broadcast('open-question', data);
  if (activeMeetingId) {
    try {
      await Meeting.findByIdAndUpdate(activeMeetingId, { $push: { openQuestions: data } });
    } catch (_) {}
  }
});
pipeline.on('follow-up', async (data) => {
  broadcast('follow-up', data);
  if (activeMeetingId) {
    try {
      await Meeting.findByIdAndUpdate(activeMeetingId, { $push: { followUps: data } });
    } catch (_) {}
  }
});
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

app.post('/api/summary/:id', async (req, res) => {
  try {
    const { force } = req.body || {};
    const meeting = await Meeting.findById(req.params.id).populate('tasks');
    
    if (!meeting) return res.status(404).json({ error: 'not found' });

    // Check if summary is already cached and we are not forcing regeneration
    if (!force && meeting.summary?.generatedAt) {
      return res.json({ summary: meeting.summary, ok: true });
    }

    const cleanedTranscript = removeFiller(meeting.transcript);
    
    // Extract and deduplicate insights
    let topics = deduplicateItems(extractTopics(cleanedTranscript));
    let decisions = deduplicateItems(extractDecisions(cleanedTranscript));
    
    // Fallback if no decisions
    if (!decisions.length) decisions = ["No major decisions recorded"];

    const transcriptLines = cleanedTranscript.split(/(?<=[.?!])\s+/).map((t, idx) => ({ 
        text: t, 
        timestamp: new Date(meeting.startedAt.getTime() + idx * 1000 * 10).toISOString() // Fake timestamp since plain transcript doesn't have it natively, but this is a placeholder. Real timelines should use timestamps if available.
    }));
    
    // Let's rely upon the actual pipeline events for timeline if available, but for now we map to fake intervals
    const timeline = buildTimeline(transcriptLines);

    // Build Highlights
    // Assuming image labels happen on the screenshots array but it only contains paths? 
    // Usually images are just paths, but since we map to buildHighlights, we use an empty array if labels aren't stored natively on meeting record.
    const highlights = []; // We aren't storing labels directly on screenshots yet.

    const reqData = {
      transcript: cleanedTranscript,
      tasks: meeting.tasks.map(t => ({ task: t.task, assignee: t.assignee })),
      decisions,
      topics,
      highlights,
      openQuestions: meeting.openQuestions || [],
      followUps: meeting.followUps || [],
      timeline
    };

    const structuredSum = await generateStructuredSummary(reqData);

    if (!structuredSum) {
        throw new Error("Summary generation failed.");
    }

    // Embed task snapshot and generation date
    structuredSum.tasks = reqData.tasks;
    structuredSum.generatedAt = new Date();

    // Save back to DB
    const updated = await Meeting.findByIdAndUpdate(req.params.id, { summary: structuredSum }, { new: true });
    res.json({ summary: updated.summary, ok: true });
  } catch (err) {
    console.error('[API] Summary generation error:', err.message);
    res.status(500).json({ error: 'Summary failed' });
  }
});

// ── Meetings ──────────────────────────────────────────────────────────────────
app.get('/meetings', async (_req, res) => {
  try {
    const meetings = await Meeting.find().populate('tasks').sort({ startedAt: -1 }).limit(20);
    res.json(meetings);
  } catch (err) {
    console.error('[Meetings GET] Error:', err);
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

  // Analyze the screenshot and inject visual context into pipeline (always, not gated on isRunning)
  if (filePath) {
    analyzeImage(filePath)
      .then((description) => {
        if (description) pipeline.addImageContext(description);
      })
      .catch((err) => console.error('[Server] Image analysis failed:', err.message));
  }

  res.json({ ok: true });
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`[Backend] running on http://localhost:${PORT}`));

module.exports = app;
