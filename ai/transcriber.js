/**
 * transcriber.js
 * Sends WAV audio buffers to OpenAI Whisper API and returns transcript text.
 * Falls back to mock if OPENAI_API_KEY is not set.
 *
 * Enhanced for HIGH ACCURACY:
 *  - Uses contextual prompting to guide Whisper toward meeting terminology
 *  - Sets temperature=0 for deterministic, most-likely transcription
 *  - Maintains a rolling context window for better continuity
 *  - Deduplicates overlapping transcription segments
 */
const { OpenAI, toFile } = require('openai');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ── Rolling context for continuity ────────────────────────────────────────────
// Whisper's `prompt` parameter seeds the model with prior context, dramatically
// improving accuracy for domain-specific words, proper nouns, and sentence flow.
let rollingContext = '';
const MAX_CONTEXT_LENGTH = 500; // chars — Whisper's prompt window is ~224 tokens

function updateContext(newText) {
  rollingContext += ' ' + newText;
  if (rollingContext.length > MAX_CONTEXT_LENGTH) {
    // Keep the last portion to stay within token limits
    rollingContext = rollingContext.slice(-MAX_CONTEXT_LENGTH);
  }
}

// ── Overlap deduplication ─────────────────────────────────────────────────────
let lastTranscriptSuffix = '';
const DEDUP_SUFFIX_LENGTH = 80; // chars to compare for overlap

function deduplicateOverlap(text) {
  if (!lastTranscriptSuffix || !text) return text;

  // Check if the new text starts with the end of the previous text
  // This handles the 1-second overlap between audio chunks
  const suffixLower = lastTranscriptSuffix.toLowerCase().trim();
  const textLower = text.toLowerCase().trim();

  // Try progressively shorter overlaps
  for (let overlapLen = Math.min(suffixLower.length, textLower.length); overlapLen >= 10; overlapLen--) {
    const suffix = suffixLower.slice(-overlapLen);
    if (textLower.startsWith(suffix)) {
      // Found overlap — trim it from the new text
      const deduplicated = text.slice(overlapLen).trim();
      if (deduplicated) {
        console.log(`[Transcriber] Deduped ${overlapLen} chars of overlap`);
        return deduplicated;
      }
    }
  }

  return text;
}

// ── WAV builder ───────────────────────────────────────────────────────────────
// Write WAV header + raw PCM so Whisper accepts it
function buildWav(pcmBuffer, sampleRate = 16000, channels = 1, bitDepth = 16) {
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);          // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bitDepth / 8, 28);
  header.writeUInt16LE(channels * bitDepth / 8, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

// ── Main transcription function ───────────────────────────────────────────────
async function transcribeChunk(audioBuffer) {
  if (!openai) {
    console.warn('[Transcriber] No API key - transcription disabled');
    return '';
  }

  // Skip very short chunks (less than 0.5 seconds of audio)
  const minBytes = 16000 * 2 * 0.5; // 16kHz * 16-bit * 0.5s
  if (audioBuffer.length < minBytes) {
    console.log('[Transcriber] Chunk too short, skipping');
    return '';
  }

  try {
    const wav = buildWav(audioBuffer);
    const file = await toFile(wav, 'meeting_audio.wav', { type: 'audio/wav' });

    // Build contextual prompt for Whisper
    // This dramatically improves accuracy for meeting-specific terminology
    const contextPrompt = buildContextPrompt();

    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en',
      // temperature=0 → most deterministic/accurate transcription
      temperature: 0,
      // Contextual prompt helps Whisper with proper nouns, jargon, continuity
      prompt: contextPrompt,
      // Request verbose output with timestamps for better segmentation
      response_format: 'verbose_json',
      // Segments that are "no speech" will be filtered
      // This avoids Whisper hallucinating text during silence
    });

    // Extract and clean the transcribed text
    let text = '';
    if (response.segments && response.segments.length > 0) {
      // Filter out low-confidence segments and "no speech" segments
      const validSegments = response.segments.filter(seg => {
        // Skip segments with very high no_speech_prob (likely silence/noise)
        if (seg.no_speech_prob > 0.7) return false;
        // Skip very short segments that are likely artifacts
        if (seg.text && seg.text.trim().length < 2) return false;
        return true;
      });
      text = validSegments.map(s => s.text).join('').trim();
    } else if (response.text) {
      text = response.text.trim();
    }

    if (!text) return '';

    // Deduplicate overlap from chunk boundaries
    text = deduplicateOverlap(text);

    if (text) {
      // Update rolling context for next chunk
      updateContext(text);
      // Remember suffix for next overlap check
      lastTranscriptSuffix = text.slice(-DEDUP_SUFFIX_LENGTH);
    }

    return text;
  } catch (err) {
    console.error('[Transcriber] error:', err.message);
    return '';
  }
}

// ── Context prompt builder ────────────────────────────────────────────────────
function buildContextPrompt() {
  // Base prompt establishes the domain and formatting expectations
  const basePrompt = 'This is a professional meeting transcription. ' +
    'Use proper punctuation and capitalization. ';

  if (rollingContext.trim()) {
    // Feed previous transcript as context for continuity
    return basePrompt + rollingContext.trim();
  }

  return basePrompt;
}

// ── Reset state (called when recording stops) ─────────────────────────────────
function resetTranscriberState() {
  rollingContext = '';
  lastTranscriptSuffix = '';
  console.log('[Transcriber] State reset');
}

module.exports = { transcribeChunk, resetTranscriberState };
