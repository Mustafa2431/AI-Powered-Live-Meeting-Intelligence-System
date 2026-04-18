/**
 * transcriber.js
 * Sends WAV audio buffers to OpenAI Whisper API and returns transcript text.
 * Falls back to mock if OPENAI_API_KEY is not set.
 */
const { OpenAI } = require('openai');
const { Readable } = require('stream');
const FormData = require('form-data');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

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

async function transcribeChunk(audioBuffer) {
  if (!openai) {
    console.warn('[Transcriber] No API key - transcription disabled');
    return '';
  }

  try {
    const wav = buildWav(audioBuffer);
    const readable = Readable.from(wav);
    readable.path = 'audio.wav'; // Whisper needs a filename hint

    const response = await openai.audio.transcriptions.create({
      file: readable,
      model: 'whisper-1',
      language: 'en',
    });
    return response.text || '';
  } catch (err) {
    console.error('[Transcriber] error:', err.message);
    return '';
  }
}

module.exports = { transcribeChunk };
