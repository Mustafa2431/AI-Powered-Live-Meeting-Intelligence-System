/**
 * pipeline.js
 * Ties together: Python Audio/Transcription (via Express) → Transcriber → TaskDetector → Summarizer
 * Emits events consumed by the Express backend which forwards to Electron IPC.
 */
const { EventEmitter } = require('events');
const { transcribeChunk } = require('./transcriber');
const { extractTasks }    = require('./taskDetector');
const { generateSummary } = require('./summarizer');

class MeetingPipeline extends EventEmitter {
  constructor() {
    super();
    this.fullTranscript = '';
    this.isRunning = false;
    this._summaryTimer = null;
    this.queue = [];
    this.isProcessing = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.fullTranscript = '';
    this.queue = [];
    this.isProcessing = false;

    // Rolling summary every 30 seconds
    this._summaryTimer = setInterval(async () => {
      if (!this.fullTranscript.trim()) return;
      const summary = await generateSummary(this.fullTranscript);
      if (summary) {
        this.emit('summary', { text: summary, timestamp: new Date().toISOString() });
      }
    }, 30000);

    console.log('[Pipeline] started');
  }

  /**
   * Handles raw transcript text from local Vosk service
   */
  handleTranscript(text) {
    if (!this.isRunning || !text) return;

    console.log('[Pipeline] Received transcript text:', text);

    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    this.fullTranscript += ' ' + text;

    // Memory Guard: Cap at 20,000 chars to avoid infinite growth
    if (this.fullTranscript.length > 20000) {
      console.log('[Pipeline] Capping transcript length');
      this.fullTranscript = this.fullTranscript.slice(-15000);
    }

    // Emit each sentence with detected tasks
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      const tasks = extractTasks(trimmedSentence);

      this.emit('transcript', {
        text: trimmedSentence,
        timestamp: new Date().toISOString(),
      });

      for (const task of tasks) {
        this.emit('task', task);
      }
    }
  }

  /**
   * Legacy: Handles raw audio chunks (Whisper flow)
   */
  handleAudioChunk(chunk) {
    if (!this.isRunning) return;
    
    if (!chunk || chunk.length < 2000) {
      console.warn('[Pipeline] Skipping small audio chunk:', chunk ? chunk.length : 0);
      return;
    }

    console.log('📦 Received:', chunk.length, 'Queue size:', this.queue.length);
    this.queue.push(chunk);
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const chunk = this.queue.shift();

      try {
        const text = await transcribeChunk(chunk);
        if (!text) continue;

        // Process transcribed text as if it came from the /transcript endpoint
        this.handleTranscript(text);
      } catch (err) {
        console.error('[Pipeline] Queue error:', err);
      }
    }

    this.isProcessing = false;
  }

  async stop() {
    if (!this.isRunning) {
      return { transcript: (this.fullTranscript || '').trim(), summary: '' };
    }
    this.isRunning = false;
    clearInterval(this._summaryTimer);
    
    // Clear queue on stop
    this.queue = [];
    this.isProcessing = false;

    // Final summary
    const summary = await generateSummary(this.fullTranscript);
    this.emit('summary', { text: summary, timestamp: new Date().toISOString(), isFinal: true });
    console.log('[Pipeline] stopped');

    return {
      transcript: this.fullTranscript.trim(),
      summary,
    };
  }

  getTranscript() {
    return this.fullTranscript;
  }
}

module.exports = new MeetingPipeline();
