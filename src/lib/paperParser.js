// Turns the text of a question paper (from a PDF or typed by a teacher) into questions.
// Handles common Indian school paper layouts:
//   "1. What is …"  "Q1) …"  "Q.1 …"  "प्रश्न 1. …"  "கேள்வி 1. …"
//   options "(a) …" "a) …" "A. …" "(1) …" (NEET style) "(क) …" "(அ) …", one per line or all on one line
//   marks "[2 marks]" "(2 M)" "(3 अंक)"; answer-key lines ("Answer: b") are dropped so students never hear them.
// The teacher always reviews the result before saving.

const LETTERS = 'abcdef';
const HI_LETTERS = ['क', 'ख', 'ग', 'घ'];
const HI_LETTERS2 = ['अ', 'ब', 'स', 'द'];
const TA_LETTERS = ['அ', 'ஆ', 'இ', 'ஈ'];
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];

const Q_START = /^(?:(?:Q(?:uestion|ues|n)?|प्रश्न|सवाल|கேள்வி)\s*\.?\s*)?(\d{1,3})\s*(?:[.):\]–-]|\s(?=[A-Zऀ-ॿ஀-௿]))\s*(.+)$/iu;
const Q_ONLY_NUM = /^(?:Q(?:uestion|ues|n)?|प्रश्न|கேள்வி)\s*\.?\s*(\d{1,3})\s*[.):\]–-]?\s*$/iu; // "Q1." on its own line
const OPT_START = /^\(?\s*([a-fA-F]|i{1,3}|iv|vi?|[कखगघअबसद]|[அஆஇஈ])\s*[).\]:]\s*(.+)$/u;
const OPT_NUM = /^\(\s*([1-6])\s*\)\s*(.+)$/u; // "(1) Mercury"
const MARKS = /\s*[[(]\s*(\d+(?:\.\d+)?)\s*(?:marks?|mks?|m|अंक|மதிப்பெண்(?:கள்)?)\s*[\])]\s*$/iu;
const MARKS_BARE = /\s+(\d+)\s*marks?\s*$/iu;
const ANSWER_KEY = /^(?:ans(?:wer)?s?(?:\s*key)?|correct\s+(?:answer|option)|उत्तर(?:\s*कुंजी)?|सही उत्तर|விடை(?:\s*குறிப்பு)?|சரியான விடை)(?=[\s:.(–-])[^:]{0,30}[:.–-]/iu;
const TIME = /(?:time|duration|समय|நேரம்)\s*(?:allowed|allotted)?\s*[:\-–]?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|घंटे|घंटा|मिनट|மணி(?:\s*நேரம்)?|நிமிடங்கள்|நிமிடம்)/iu;
const NOISE = /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d{1,3}|p\.?\s*t\.?\s*o\.?|[-–_=*.\s]+|turn over|contd\.?|continued)$/iu;
const VISUAL = /(?:\b(?:figure|fig\.|diagram|map|graph|picture|image|shown (?:below|above|alongside)|the given (?:figure|diagram|map|graph))\b|चित्र|आकृति|मानचित्र|नक्शा|ग्राफ|படம்|வரைபட)/iu;
const SECTION = /^(?:section|part|खंड|भाग|பகுதி)\s*[-–:]?\s*[A-Z\dIVX]+\b.*$/iu;

function optionIndex(label) {
  const l = label.toLowerCase();
  if (LETTERS.includes(l) && l.length === 1) return LETTERS.indexOf(l);
  for (const list of [HI_LETTERS, HI_LETTERS2, TA_LETTERS]) if (list.includes(label)) return list.indexOf(label);
  if (ROMAN.includes(l)) return ROMAN.indexOf(l);
  return -1;
}

/** "(a) Mercury (b) Venus (c) Earth (d) Mars" → one option per line. */
function splitInlineOptions(line) {
  const markers = [
    /\s*\(\s*(?:[a-fA-F]|[कखगघ]|[அஆஇஈ]|[1-6])\s*\)\s+/gu, // (a) (क) (1)
    /(?:^|\s+)(?:[a-dA-D])[.)]\s+/gu, // a) b) or A. B.
  ];
  for (const re of markers) {
    const hits = [...line.matchAll(re)];
    if (hits.length >= 2) {
      const parts = [];
      let last = 0;
      hits.forEach((h, i) => {
        if (i === 0 && h.index > 0) parts.push(line.slice(0, h.index).trim());
        if (i > 0) parts.push(line.slice(last, h.index).trim());
        last = h.index;
      });
      parts.push(line.slice(last).trim());
      return parts.filter(Boolean);
    }
  }
  return [line];
}

function takeMarks(text) {
  let m = text.match(MARKS) || text.match(MARKS_BARE);
  if (!m) return { text, marks: null };
  return { text: text.slice(0, m.index).trim(), marks: Number(m[1]) };
}

const clean = (t) => t.replace(/\s+/g, ' ').replace(/\s+([,.?!।])/gu, '$1').trim();

export function parsePaper(raw) {
  const warnings = [];
  const lines = String(raw || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter((l) => l && !NOISE.test(l))
    .flatMap(splitInlineOptions);

  const questions = [];
  const before = [];
  let cur = null;
  let lastNum = 0;
  let pendingNum = null;
  let droppedKeys = 0;

  const finish = () => {
    if (!cur) return;
    const t = takeMarks(clean(cur.text));
    cur.text = t.text;
    if (t.marks && !cur.marks) cur.marks = t.marks;
    cur.options = cur.options.map((o) => {
      const om = takeMarks(clean(o));
      if (om.marks && !cur.marks) cur.marks = om.marks;
      return om.text;
    });
    if (cur.text) questions.push(cur);
    cur = null;
  };

  for (const line of lines) {
    if (ANSWER_KEY.test(line)) {
      droppedKeys++;
      continue;
    }
    if (SECTION.test(line) && !OPT_START.test(line)) {
      finish();
      continue;
    }
    // "(1) Mercury" inside a question is an option (NEET style), not question 1.
    const on = line.match(OPT_NUM);
    if (cur && on && Number(on[1]) === cur.options.length + 1) {
      cur.options.push(on[2]);
      continue;
    }
    const lone = line.match(Q_ONLY_NUM);
    if (lone) {
      finish();
      pendingNum = Number(lone[1]);
      cur = { num: pendingNum, text: '', options: [], marks: null };
      lastNum = pendingNum;
      continue;
    }
    const q = line.match(Q_START);
    const o = line.match(OPT_START);
    const isOption = cur && o && optionIndex(o[1]) === cur.options.length && (cur.text || cur.options.length);
    if (q && !isOption) {
      const n = Number(q[1]);
      // "1) Mercury 2) Venus …" under a question: numbered options, not new questions.
      const numberedOption = cur && cur.text && n === cur.options.length + 1 && n <= 6 && (cur.numOpts || n !== lastNum + 1);
      if (numberedOption) {
        cur.numOpts = true;
        cur.options.push(q[2]);
        continue;
      }
      // A new question normally continues the numbering; a stray number inside text does not.
      if (!cur || n === lastNum + 1 || (n > lastNum && n - lastNum <= 3)) {
        finish();
        cur = { num: n, text: q[2], options: [], marks: null };
        lastNum = n;
        continue;
      }
    }
    if (isOption) {
      cur.options.push(o[2]);
      continue;
    }
    if (!cur) {
      before.push(line);
      continue;
    }
    if (cur.options.length) cur.options[cur.options.length - 1] += ` ${line}`;
    else cur.text += ` ${line}`;
  }
  finish();

  let out = questions;
  if (!out.length) {
    // No numbering: one question per line (the simple "type a list" format).
    out = before.map((text) => ({ text: clean(text), options: [], marks: null }));
    before.length = 0;
  }
  const result = out.map((q) => {
    const opts = q.options.filter(Boolean);
    const r = { text: q.text, type: opts.length >= 2 ? 'mcq' : 'text' };
    if (opts.length >= 2) r.options = opts;
    if (q.marks) r.marks = q.marks;
    if (opts.length === 1) warnings.push(`Question “${q.text.slice(0, 40)}” has only one option; it was kept as a written question.`);
    return r;
  });
  // Guidelines give visually impaired candidates an alternative question in place of questions with visual input.
  const visual = result.map((q, i) => (VISUAL.test(q.text) ? i + 1 : 0)).filter(Boolean);
  if (visual.length) {
    warnings.push(`Question ${visual.join(', ')} ${visual.length === 1 ? 'seems' : 'seem'} to need a figure, map, graph or picture. Blind students are given an alternative question in place of visual ones; replace ${visual.length === 1 ? 'it' : 'them'} before saving.`);
  }
  if (droppedKeys) warnings.push(`${droppedKeys} answer-key ${droppedKeys === 1 ? 'line was' : 'lines were'} removed so students do not hear the answers.`);
  const tm = before.join(' ').match(TIME);
  const minutes = tm ? Math.round(Number(tm[1]) * (/^(?:h|घं|மணி)/iu.test(tm[2]) ? 60 : 1)) : 0;
  const title = before.find((l) => l.length >= 4 && l.length <= 90 && !/instruction|time|marks|निर्देश|समय|அறிவுறுத்தல்/iu.test(l)) || '';
  return { title, minutes, instructions: before.filter((l) => l !== title), questions: result, warnings };
}
