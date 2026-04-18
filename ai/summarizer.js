/**
 * summarizer.js
 * Generates a rolling summary from transcript text.
 * Uses OpenAI GPT if key is set, otherwise returns a mock summary.
 */
const { OpenAI } = require('openai');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function generateSummary(transcriptText) {
  if (!openai || !transcriptText.trim()) {
    return '';
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a meeting assistant. Summarize the following meeting transcript in 2-3 concise sentences. Focus on key decisions, action items, and topics discussed.',
        },
        { role: 'user', content: transcriptText },
      ],
      max_tokens: 150,
    });
    return response.choices[0]?.message?.content || '';
  } catch (err) {
    console.error('[Summarizer] error:', err.message);
    return '';
  }
}

module.exports = { generateSummary };
