/**
 * insightDetector.js
 * Regex + keyword based detection of open questions and follow-up meeting intents.
 * No LLM — purely rule-based for speed and reliability.
 */

// ── Open Question Detection ────────────────────────────────────────────────────

const QUESTION_WORDS   = ['what', 'why', 'how', 'when', 'who', 'which', 'where'];
const UNCERTAINTY_PHRASES = [
  'not sure', 'need to check', 'we should confirm', "let's find out",
  'need to figure out', 'unclear', 'do we know', 'has anyone checked',
];

/**
 * Checks if a sentence is an open/unresolved question.
 * @param {string} sentence
 * @returns {{ question: string, timestamp: string } | null}
 */
function detectOpenQuestion(sentence) {
  const s = sentence.trim();
  if (!s) return null;

  const lower = s.toLowerCase();

  // Rule 1: ends with a question mark
  if (s.endsWith('?')) {
    return { question: s, timestamp: new Date().toLocaleTimeString() };
  }

  // Rule 2: starts with a question word
  const firstWord = lower.split(/\s+/)[0];
  if (QUESTION_WORDS.includes(firstWord)) {
    return { question: s, timestamp: new Date().toLocaleTimeString() };
  }

  // Rule 3: contains uncertainty phrases
  for (const phrase of UNCERTAINTY_PHRASES) {
    if (lower.includes(phrase)) {
      return { question: s, timestamp: new Date().toLocaleTimeString() };
    }
  }

  return null;
}

// ── Follow-up Meeting Detection ────────────────────────────────────────────────

const FOLLOWUP_KEYWORDS = [
  "let's meet", "lets meet",
  "schedule a call", "schedule a meeting",
  "next meeting", "next call", "next session",
  "follow up", "follow-up",
  "we will discuss", "we'll discuss",
  "discuss later", "discuss this later",
  "sync tomorrow", "sync next", "sync up",
  "connect again", "reconnect",
  "circle back", "revisit this",
  "pick this up",
];

/**
 * Checks if a sentence suggests a future meeting or follow-up.
 * @param {string} sentence
 * @returns {{ suggestion: string, context: string, timestamp: string } | null}
 */
function detectFollowUp(sentence) {
  const s = sentence.trim();
  if (!s) return null;

  const lower = s.toLowerCase();

  for (const keyword of FOLLOWUP_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        suggestion: 'Schedule a follow-up meeting',
        context:    s,
        timestamp:  new Date().toLocaleTimeString(),
      };
    }
  }

  return null;
}

// ── Normalization for deduplication ───────────────────────────────────────────

/**
 * Simple string similarity check for deduplication (substring containment).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isSimilarInsight(a, b) {
  const na = a.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const nb = b.toLowerCase().replace(/[^\w\s]/g, '').trim();
  return na === nb || na.includes(nb) || nb.includes(na);
}

module.exports = { detectOpenQuestion, detectFollowUp, isSimilarInsight };
