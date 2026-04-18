/**
 * dataExtractor.js
 * Contains algorithms to extract insights from raw meeting data cleanly without LLM overhead.
 */

const { normalizeTask, areSimilar } = require('./taskDetector');

const STOPWORDS = new Set([
  "the","is","and","to","we","a","of","for","in","on",
  "it","this","that","be","do","are","was","will","with","have","just","get",
  "can","but","so","if","then","you","they","our","i","my","use","make","not","as",
  "at","by","or","from","what","which","who","how","about", "like", "know", "yeah"
]);

const FILLER_PATTERN = /\b(uh|hmm|like|you know|sort of|basically)\b/gi;

/**
 * Strips out filler words.
 */
function removeFiller(text = '') {
  return text.replace(FILLER_PATTERN, '').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts topics efficiently.
 */
function extractTopics(transcript = '') {
  const words = transcript.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  
  const freq = {};
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }

  return Object.entries(freq)
    .filter(([_, count]) => count >= 2) // avoid noise
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

const DECISION_PATTERNS = [
  /we decided to (.+?)(?:[.!,]|$)/ig,
  /we will go with (.+?)(?:[.!,]|$)/ig,
  /finali[sz]ed (.+?)(?:[.!,]|$)/ig,
  /agreed to (.+?)(?:[.!,]|$)/ig,
  /decision[:\-] (.+?)(?:[.!,]|$)/ig,
  /let'?s go with (.+?)(?:[.!,]|$)/ig
];

/**
 * Regex-based extraction of important decisions from transcript.
 */
function extractDecisions(transcript = '') {
  const decisions = [];
  for (const pattern of DECISION_PATTERNS) {
    let match;
    // reset regex
    pattern.lastIndex = 0;
    while ((match = pattern.exec(transcript)) !== null) {
      if (match[1] && match[1].trim()) {
        decisions.push(removeFiller(match[1].trim()));
      }
    }
  }

  // Deduplicate before returning
  return deduplicateItems(decisions);
}

/**
 * Groups raw transcript lines into 5-minute buckets.
 */
function buildTimeline(lines = []) {
  if (!lines.length) return [];
  const buckets = {};

  for (const line of lines) {
    try {
      const date = new Date(line.timestamp);
      // Generate a string bucket key based on the 5-minute block.
      // Format: YYYY-MM-DD HH:MM - where MM is rounded down to nearest 5.
      const minutes = date.getMinutes();
      const roundedMin = Math.floor(minutes / 5) * 5;
      const bucketDate = new Date(date);
      bucketDate.setMinutes(roundedMin, 0, 0);

      // E.g. "10:00–10:05"
      const bucketEnd = new Date(bucketDate);
      bucketEnd.setMinutes(bucketDate.getMinutes() + 5);
      
      const timeFormatter = new Intl.DateTimeFormat('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const rangeKey = `${timeFormatter.format(bucketDate)}–${timeFormatter.format(bucketEnd)}`;

      if (!buckets[rangeKey]) {
        buckets[rangeKey] = [];
      }
      buckets[rangeKey].push(line.text);
    } catch (e) {
      // Ignored malformed timestamps
    }
  }

  return Object.keys(buckets).map(range => ({
    range,
    text: buckets[range].join('. ').replace(/\s+/g, ' ').substring(0, 1500) // LLM can process chunk safely
  }));
}

/**
 * Simple mapper for screenshots.
 */
function buildHighlights(imageContexts = []) {
  return imageContexts
    .map(img => `${img.timestamp} → ${img.label}`)
    .filter(Boolean); // safety guard to remove nulls
}

/**
 * Deduplicate strings using areSimilar.
 */
function deduplicateItems(items) {
  const seen = new Set();
  const result = [];
  for (const text of items) {
    const norm = normalizeTask(text);
    const isDup = [...seen].some(s => areSimilar(s, norm));
    if (!isDup) {
      seen.add(norm);
      result.push(text);
    }
  }
  return result;
}

module.exports = {
  removeFiller,
  extractTopics,
  extractDecisions,
  buildTimeline,
  buildHighlights,
  deduplicateItems
};
