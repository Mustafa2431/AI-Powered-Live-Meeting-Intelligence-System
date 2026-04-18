/**
 * taskDetector.js
 * Regex-based action item extractor with normalization + concise task extraction.
 * Returns: Array of { task, assignee, confidence, timestamp }
 */

// Filler words to strip from extracted task text
const FILLERS = new Set(['the', 'this', 'it', 'a', 'an', 'that', 'these', 'those']);

/**
 * Normalizes a task string for deduplication comparison:
 * lowercase, strip punctuation, collapse spaces, remove fillers.
 * @param {string} text
 * @returns {string}
 */
function normalizeTask(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')          // remove punctuation
    .split(/\s+/)
    .filter(w => w && !FILLERS.has(w)) // drop filler words
    .join(' ')
    .trim();
}

/**
 * Strips leading modal/filler verbs so the task starts at the real action.
 * "complete the UI design" → "complete UI design"
 * "do the report" → "do report"
 * @param {string} rawTask - raw captured task string
 * @returns {string} - concise action phrase
 */
function toConcisetask(rawTask) {
  return rawTask
    .replace(/\b(the|this|it|a|an|that)\b/gi, '') // remove filler words
    .replace(/\s{2,}/g, ' ')                       // collapse spaces
    .trim();
}

const PATTERNS = [
  // "X will do Y"  or  "X will handle Y"
  {
    re: /\b(?<assignee>[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+will\s+(?<task>.+?)(?:[,.]|$)/gi,
    confidence: 0.85,
  },
  // "I will ..."
  {
    re: /\bI(?:'m going to| will| am going to)\s+(?<task>.+?)(?:[,.]|$)/gi,
    assignee: 'Me',
    confidence: 0.75,
  },
  // "Assign ... to X"
  {
    re: /\bAssign\s+(?<task>.+?)\s+to\s+(?<assignee>[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?:[,.]|$)/gi,
    confidence: 0.90,
  },
  // "Action item: ..."
  {
    re: /\baction item\s*[:–-]\s*(?<task>.+?)(?:[,.]|$)/gi,
    assignee: 'Unassigned',
    confidence: 0.70,
  },
  // "X should/must/needs to ..."
  {
    re: /\b(?<assignee>[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:should|must|needs to)\s+(?<task>.+?)(?:[,.]|$)/gi,
    confidence: 0.65,
  },
];

/**
 * Checks if two normalized task strings are similar enough to be duplicates.
 * Uses substring containment + basic character overlap ratio.
 * @param {string} a - normalized task
 * @param {string} b - normalized task
 * @returns {boolean}
 */
function areSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  // Simple character-level similarity (Dice coefficient over bigrams)
  const bigrams = (s) => {
    const bg = new Set();
    for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
    return bg;
  };
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  let shared = 0;
  for (const bg of bgA) if (bgB.has(bg)) shared++;
  const similarity = (2 * shared) / (bgA.size + bgB.size);
  return similarity >= 0.8;
}

/**
 * @param {string} sentence
 * @returns {Array<{task: string, assignee: string, confidence: number, timestamp: string}>}
 */
function extractTasks(sentence) {
  const results = [];

  for (const { re, assignee: staticAssignee, confidence } of PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(sentence)) !== null) {
      const groups   = match.groups || {};
      const rawTask  = (groups.task || '').trim();
      const assignee = (groups.assignee || staticAssignee || 'Unassigned').trim();

      if (rawTask.split(' ').length < 2) continue; // skip noise

      const conciseTask = toConcisetask(rawTask);
      if (!conciseTask || conciseTask.split(' ').length < 1) continue;

      // Capitalize first letter
      const finalTask = conciseTask.charAt(0).toUpperCase() + conciseTask.slice(1);
      const normalized = normalizeTask(conciseTask);

      // Deduplicate within this extraction batch
      const isDup = results.some(r => areSimilar(normalizeTask(r.task), normalized));
      if (isDup) continue;

      results.push({
        task: finalTask,
        assignee,
        confidence,
        normalized, // carry normalized form for pipeline-level dedup
        timestamp: new Date().toISOString(),
      });
    }
  }

  return results;
}

module.exports = { extractTasks, normalizeTask, areSimilar };
