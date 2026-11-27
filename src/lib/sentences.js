// Answer model. An answer is a list of dictated chunks (strings). A "\n" inside or as a chunk
// marks a paragraph break. Sentences are found by splitting chunks at . ? ! । ॥ followed by a
// space; a chunk without punctuation is one sentence. Recognised words are never rewritten.

const SPLIT = /(?<=[.?!।॥])\s+/u;

export function splitChunk(chunk) {
  return String(chunk || '')
    .trim()
    .split(SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Flatten chunks into [{t:'s', text}] sentences and [{t:'p'}] paragraph breaks. */
export function tokens(chunks) {
  const out = [];
  for (const chunk of chunks || []) {
    String(chunk).split(/\n+/).forEach((part, j) => {
      if (j > 0) out.push({ t: 'p' });
      splitChunk(part).forEach((text) => out.push({ t: 's', text }));
    });
  }
  // Drop leading breaks and collapse repeated breaks; keep a trailing break (next text starts a new paragraph).
  const clean = [];
  for (const tok of out) {
    if (tok.t === 'p' && (!clean.length || clean[clean.length - 1].t === 'p')) continue;
    clean.push(tok);
  }
  return clean;
}

export function fromTokens(toks) {
  return toks.map((tok) => (tok.t === 'p' ? '\n' : tok.text));
}

export function getSentences(chunks) {
  return tokens(chunks).filter((t) => t.t === 's').map((t) => t.text);
}

/** [[{n, text}, …], …] – sentence numbers run across paragraphs. */
export function paragraphs(chunks) {
  const out = [[]];
  let n = 0;
  for (const tok of tokens(chunks)) {
    if (tok.t === 'p') out.push([]);
    else out[out.length - 1].push({ n: ++n, text: tok.text });
  }
  return out.filter((p) => p.length);
}

export function answerText(chunks) {
  return paragraphs(chunks).map((p) => p.map((s) => s.text).join(' ')).join('\n\n');
}

function sentencePos(toks, idx) {
  let k = -1;
  for (let i = 0; i < toks.length; i++) if (toks[i].t === 's' && ++k === idx) return i;
  return -1;
}

export function replaceSentence(chunks, idx, text) {
  const toks = tokens(chunks);
  const pos = sentencePos(toks, idx);
  if (pos < 0) return chunks;
  toks[pos] = { t: 's', text };
  return fromTokens(toks);
}

export function deleteSentence(chunks, idx) {
  const toks = tokens(chunks);
  const pos = sentencePos(toks, idx);
  if (pos < 0) return chunks;
  toks.splice(pos, 1);
  return fromTokens(toks);
}

/** Insert `text` so that it becomes sentence number `idx` (0-based). */
export function insertSentence(chunks, idx, text) {
  const toks = tokens(chunks);
  const count = toks.filter((t) => t.t === 's').length;
  if (idx >= count) return [...fromTokens(toks), text];
  const pos = sentencePos(toks, Math.max(0, idx));
  toks.splice(pos, 0, { t: 's', text });
  return fromTokens(toks);
}

const B = '(?<![\\p{L}\\p{M}\\p{N}])'; // Unicode-aware word start
const E = '(?![\\p{L}\\p{M}\\p{N}])'; // Unicode-aware word end
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace the first occurrence of a word or phrase in the answer (whole words first, then any
 * substring). Returns null when it is not found.
 */
export function replaceWord(chunks, from, to) {
  const sents = getSentences(chunks);
  const f = String(from).trim();
  if (!f) return null;
  const whole = new RegExp(`${B}${esc(f)}${E}`, 'iu');
  const loose = new RegExp(esc(f), 'iu');
  for (const re of [whole, loose]) {
    const idx = sents.findIndex((s) => re.test(s));
    if (idx < 0) continue;
    const all = new RegExp(re.source, 'giu');
    const count = sents.reduce((n, s) => n + (s.match(all) || []).length, 0);
    const newSentence = sents[idx].replace(re, to);
    return { chunks: replaceSentence(chunks, idx, newSentence), index: idx, count, newSentence };
  }
  return null;
}

// ---------- word level ----------
const strip = (w) => String(w).toLowerCase().replace(/[.,?!।॥;:"'“”‘’()]/gu, '');

/** Words of a sentence as spoken (punctuation removed), for reading out with numbers. */
export function wordsOf(sentence) {
  return String(sentence || '').split(/\s+/).filter(Boolean).map((w) => w.replace(/[.,?!।॥;:"“”()]/gu, '')).filter(Boolean);
}

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const similarity = (a, b) => (a === b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length, 1));

/**
 * Find the words in a sentence that sound most like `spoken` (one or more words). Speech
 * recognisers often write the student's correction correctly ("sunlight") even though the
 * answer has the mistake ("sunlite"), so the match is fuzzy. Returns {start, len, score} or null.
 */
export function findWords(sentence, spoken, minScore = 0.5) {
  const target = String(spoken || '').split(/\s+/).map(strip).filter(Boolean);
  const raw = String(sentence || '').split(/\s+/).filter(Boolean);
  const ws = raw.map(strip);
  if (!target.length || !ws.length) return null;
  let best = null;
  for (let len = Math.max(1, target.length - 1); len <= target.length + 1; len++) {
    for (let i = 0; i + len <= ws.length; i++) {
      const score = similarity(ws.slice(i, i + len).join(' '), target.join(' '));
      if (!best || score > best.score || (score === best.score && Math.abs(len - target.length) < Math.abs(best.len - target.length))) {
        best = { start: i, len, score };
      }
    }
  }
  return best && best.score >= minScore ? best : null;
}

/** Stricter match for anchors ("add after green plants"): same number of words, each word close. */
export function findPhrase(sentence, phrase, minWord = 0.75) {
  const target = String(phrase || '').split(/\s+/).map(strip).filter(Boolean);
  const ws = String(sentence || '').split(/\s+/).filter(Boolean).map(strip);
  let best = null;
  for (let i = 0; target.length && i + target.length <= ws.length; i++) {
    const score = Math.min(...target.map((t, j) => similarity(ws[i + j], t)));
    if (score >= minWord && (!best || score > best.score)) best = { start: i, len: target.length, score };
  }
  return best;
}

/** Replace `len` words starting at word `start` (keeps punctuation that followed the last word). */
export function replaceWordsAt(sentence, start, len, replacement) {
  const raw = String(sentence || '').split(/\s+/).filter(Boolean);
  const last = raw[start + len - 1] || '';
  const trail = (last.match(/[.,?!।॥;:]+$/u) || [''])[0];
  const repl = String(replacement || '').trim();
  if (repl) return [...raw.slice(0, start), repl + trail, ...raw.slice(start + len)].join(' ').trim();
  // Deleting: if the removed words ended the sentence, move the full stop to the new last word.
  const out = [...raw.slice(0, start), ...raw.slice(start + len)];
  if (trail && start > 0 && start + len >= raw.length) out[start - 1] = out[start - 1].replace(/[.,?!।॥;:]*$/u, '') + trail;
  return out.join(' ').trim();
}

/** Insert text after the words matched by `anchor` inside a sentence. */
export function insertAfterWords(sentence, start, len, text) {
  const raw = String(sentence || '').split(/\s+/).filter(Boolean);
  const pos = start + len;
  // "…photosynthesis." + "using light" → "…photosynthesis using light." (the mark moves to the end of the insert)
  const trail = (raw[pos - 1].match(/[.,?!।॥;:]+$/u) || [''])[0];
  if (trail) raw[pos - 1] = raw[pos - 1].slice(0, -trail.length);
  return [...raw.slice(0, pos), String(text).trim() + trail, ...raw.slice(pos)].join(' ').trim();
}

// Spoken punctuation: the student says the name of a mark and it is inserted.
// Only these explicit mark names, as whole words, are converted; no other word is changed.
const mark = (words, symbol) => [new RegExp(`\\s*${B}(?:${words.join('|')})${E}`, 'giu'), symbol];
const MARKS = [
  mark(['new paragraph', 'next paragraph', 'new para', 'next para', 'new line', 'next line', 'नया अनुच्छेद', 'अगला अनुच्छेद', 'नया पैराग्राफ', 'अगला पैराग्राफ', 'नई लाइन', 'अगली लाइन', 'புதிய பத்தி', 'அடுத்த பத்தி', 'புதிய வரி', 'அடுத்த வரி'], '¶'),
  mark(['full stop', 'fullstop', 'next sentence', 'new sentence', 'अगला वाक्य', 'नया वाक्य', 'அடுத்த வாக்கியம்', 'புதிய வாக்கியம்'], '.'),
  mark(['question mark'], '?'),
  mark(['exclamation mark', 'exclamation point'], '!'),
  mark(['comma'], ','),
  mark(['पूर्ण विराम', 'पूर्णविराम', 'फुल स्टॉप', 'फुलस्टॉप'], '।'),
  mark(['प्रश्नवाचक चिह्न', 'प्रश्नवाचक चिन्ह', 'क्वेश्चन मार्क'], '?'),
  mark(['अल्पविराम', 'अल्प विराम', 'कॉमा'], ','),
  mark(['முற்றுப்புள்ளி', 'ஃபுல் ஸ்டாப்'], '.'),
  mark(['கேள்விக்குறி'], '?'),
  mark(['காற்புள்ளி', 'கமா'], ','),
];

export function applySpokenPunctuation(text) {
  let out = String(text || '');
  for (const [re, symbol] of MARKS) out = out.replace(re, symbol);
  return out
    .replace(/([,.?!।])(?=[^\s,.?!।¶])/gu, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*¶[ \t]*/g, '\n')
    .replace(/^[ \t]+|[ \t]+$/g, '');
}

export const isOnlyPunctuation = (t) => /^[\s,.?!।]+$/u.test(t) && /\S|\n/.test(t);
