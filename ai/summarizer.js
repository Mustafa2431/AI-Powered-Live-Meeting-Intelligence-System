/**
 * summarizer.js
 * Generates a rolling meeting summary using Groq.
 * Accepts transcript text + optional visual screen context from screenshots.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const SUMMARY_MODEL = 'llama-3.3-70b-versatile';

/**
 * Generates a concise meeting summary.
 * @param {string} transcriptText - Full or partial meeting transcript
 * @param {string[]} imageContexts - Optional array of screen descriptions from screenshots
 * @returns {Promise<string>} - Summary text or empty string on failure
 */
async function generateSummary(transcriptText, imageContexts = []) {
  if (!transcriptText || !transcriptText.trim()) return '';

  // Build the visual context section with spacing between each capture
  const visualSection = imageContexts.length > 0
    ? `\n\nVisual context from screen captures:\n\n${imageContexts.map((d, i) => `📸 Screen ${i + 1}:\n${d}`).join('\n\n')}`
    : '';

  const userContent = `Meeting transcript:\n${transcriptText}${visualSection}`;

  try {
    const response = await groq.chat.completions.create({
      model: SUMMARY_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a meeting assistant. Produce a structured summary with these sections:\n' +
            '**Discussion:** 1-2 sentences on topics discussed.\n' +
            '**Visuals:** bullet points of key content seen on screen (only if screen captures provided).\n' +
            '**Action Items:** bullet points of any tasks or decisions (omit if none).\n' +
            'Keep each section concise. Skip any section that has no content.',
        },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const summary = response.choices[0]?.message?.content?.trim() || '';
    if (summary) console.log('[Summarizer] Generated summary.');
    return summary;
  } catch (err) {
    console.error('[Summarizer] Groq error:', err.message);
    return '';
  }
}

/**
 * Generates a structured JSON summary on demand.
 */
async function generateStructuredSummary(data) {
  const { topics = [], tasks = [], decisions = [], highlights = [], openQuestions = [], timeline = [], followUps = [] } = data;
  // Truncate transcript to last 4000 chars to avoid Groq token overflow / broken JSON
  const transcript = (data.transcript || '').slice(-4000);

  const userContent = `DATA:
Transcript:
${transcript}

Topics:
${topics.join(', ') || 'None'}

Tasks:
${JSON.stringify(tasks)}

Decisions:
${decisions.map(d => `- ${d}`).join('\n') || 'None'}

Follow-ups / Scheduled Meetings:
${JSON.stringify(followUps)}

Open Questions:
${JSON.stringify(openQuestions)}

Visual Context (Screenshots with AI descriptions):
${highlights.map((h, i) => `[Screen ${i+1}] ${h}`).join('\n') || 'None — no screenshots taken'}

Use these screen descriptions to enrich the summary with UI, slide, or document insights.

Timeline:
${JSON.stringify(timeline)}
`;

  try {
    const response = await groq.chat.completions.create({
      model: SUMMARY_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a professional meeting analyst.

Analyze the complete meeting data and generate a structured report.

STRICT RULES:
* Include ALL important information from the data
* Do NOT miss tasks, decisions, or follow-ups
* Do NOT repeat items
* Keep sentences concise and clear
* Use bullet points where applicable

OUTPUT FORMAT (STRICT JSON ONLY, NO EXTRA TEXT):
{
  "overview": "A short 2-3 line summary of the meeting",
  "topics": ["..."],
  "decisions": ["..."],
  "tasks": [
    { "task": "...", "assignee": "..." }
  ],
  "followUps": ["..."],
  "openQuestions": ["..."],
  "highlights": ["..."],
  "timeline": [
    { "range": "...", "summary": "..." }
  ]
}

IMPORTANT:
* overview MUST be a concise AI-generated summary (like OpenAI summary)
* tasks MUST clearly mention assignee
* followUps MUST include any future meetings or scheduled discussions
* If a section has no data, return an empty array`,
        },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    });

    const raw = response.choices[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM returned no valid JSON block. Raw: ' + raw.slice(0, 200));
    
    return JSON.parse(match[0]);
  } catch (err) {
    console.error('[Summarizer] Structured JSON generation error:', err.message);
    return {
      overview: "Summary not available",
      topics: [],
      decisions: [],
      tasks: [],
      followUps: [],
      openQuestions: [],
      highlights: [],
      timeline: []
    };
  }
}

module.exports = { generateSummary, generateStructuredSummary };
