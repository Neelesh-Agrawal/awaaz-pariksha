// Exam state machine. Owns all state; React only renders it and forwards button presses.
// Speech states: IDLE, SPEAKING, LISTENING_FOR_COMMAND, DICTATING, EDIT_COMMAND, CONFIRMING, SUBMITTED.
import { SpeechIO } from './speech.js';
import { parseCommand, parseCommandAlternatives, parseDictationCommand, parseLanguage, parseYesNo, parseChoiceText, isFiller, normalize, stripWake, findWake, parseInstruction, parseOptionMention, parseLockIntent, similarity } from './commandParser.js';
import {
  getSentences, paragraphs, applySpokenPunctuation, isOnlyPunctuation,
  replaceSentence, deleteSentence, insertSentence, replaceWord,
  wordsOf, findWords, findPhrase, replaceWordsAt, insertAfterWords,
} from './sentences.js';
import { initEarcons, playEarcon, buzz } from './earcons.js';
import { bumpLevel, startLevel } from './micLevel.js';
import { loadSaved, saveState, clearSaved, PERSISTED_KEYS } from './storage.js';
import { msg, helpText, LANG_NAMES, LANGS, answerLangName } from '../i18n.js';
import { QUESTIONS, QUESTION_COUNT, OPTION_LETTERS } from '../data/questions.js';

export const MODE = {
  IDLE: 'IDLE',
  SPEAKING: 'SPEAKING',
  LISTENING_FOR_COMMAND: 'LISTENING_FOR_COMMAND',
  DICTATING: 'DICTATING',
  EDIT_COMMAND: 'EDIT_COMMAND',
  CONFIRMING: 'CONFIRMING',
  SUBMITTED: 'SUBMITTED',
};
const LISTENING = new Set([MODE.LISTENING_FOR_COMMAND, MODE.DICTATING, MODE.EDIT_COMMAND, MODE.CONFIRMING, MODE.SUBMITTED]);
// While dictating, a whole utterance that is exactly one of these commands is acted on
// (the answer is saved first). Short words like "yes", "no", "done" stay answer text.
const NOT_IN_DICTATION = new Set([
  'CONFIRM', 'KEEP', 'TRY_AGAIN', 'CONTINUE', 'REPEAT', 'DONE', 'RESUME', 'START_EXAM', 'CHANGE_LANGUAGE', 'PRINT',
  // "next sentence" / "next para" while dictating are sentence and paragraph breaks, not navigation.
  'NEXT_ITEM', 'PREV_ITEM', 'NEXT_SENTENCE', 'PREV_SENTENCE', 'NEXT_PARAGRAPH', 'PREV_PARAGRAPH',
  // Too likely to be real answer words ("fix the leak", "add after mixing…").
  'FIX_WORD', 'ADD_AFTER_TEXT', 'READ_THIS', 'GOTO_SENTENCE', 'CHANGE_WORD', 'DELETE_THIS', 'REWRITE_THIS', 'ADD_AFTER_THIS', 'READ_WORDS',
  // Multiple-choice words ("lock", "final", "it is a …") are ordinary answer words in a written answer.
  'READ_OPTIONS', 'READ_OPTION', 'NEXT_OPTION', 'PREV_OPTION', 'SELECT_OPTION', 'LOCK_CHOICE', 'UNLOCK_CHOICE', 'CLEAR_CHOICE', 'MY_CHOICE', 'UNMARK_REVIEW',
]);
const MCQ_TYPES = new Set(['READ_OPTIONS', 'READ_OPTION', 'NEXT_OPTION', 'PREV_OPTION', 'SELECT_OPTION', 'LOCK_CHOICE', 'UNLOCK_CHOICE', 'CLEAR_CHOICE', 'MY_CHOICE']);
const ONE_WORD_OK_IN_DICTATION = new Set(['STOP_ANSWER', 'PAUSE', 'HELP', 'UNDO']);
const EDIT_TYPES = new Set([
  'REPLACE_SENTENCE', 'DELETE_SENTENCE', 'ADD_TO_ANSWER', 'UNDO', 'READ_SENTENCE', 'READ_PARAGRAPH', 'INSERT_AFTER', 'INSERT_BEFORE',
  'REPLACE_WORD', 'CLEAR_ANSWER', 'GOTO_SENTENCE', 'NEXT_SENTENCE', 'PREV_SENTENCE', 'NEXT_PARAGRAPH', 'PREV_PARAGRAPH', 'READ_WORDS',
  'CHANGE_WORD', 'DELETE_WORD', 'DELETE_THIS', 'REWRITE_THIS', 'ADD_AFTER_THIS', 'READ_THIS', 'FIX_WORD', 'REPLACE_WITH', 'ADD_AFTER_TEXT', 'REMOVE_WORDS',
]);
const LOW_CONFIDENCE = 0.6;

const emptyArrays = (n = QUESTION_COUNT) => Array.from({ length: n }, () => []);
export const DEFAULT_SETUP = { title: 'Science practice paper', questions: null, durationMin: 0, extraTime: true, lang: null };
// DEPwD guidelines (OM 29.08.2018 and OM 10.08.2022, still in force for school, college and
// university exams): compensatory time of not less than 20 minutes per hour of examination,
// pro-rata for shorter exams, never less than 5 minutes and always in multiples of 5.
export const COMPENSATORY_MIN_PER_HOUR = 20;
export const compensatoryMinutes = (base) => {
  const b = Number(base) || 0;
  if (b <= 0) return 0;
  return Math.max(5, Math.ceil((b * COMPENSATORY_MIN_PER_HOUR) / 60 / 5) * 5);
};
export const totalMinutes = (setup) => {
  const base = Number(setup?.durationMin) || 0;
  return base > 0 && setup?.extraTime ? base + compensatoryMinutes(base) : base;
};
const freshPersisted = (n = QUESTION_COUNT) => ({
  lang: null, // the language the app talks in (English, Hindi or Tamil)
  answerLang: null, // the language answers are recognised in (any Indian language); null = same as lang
  started: false,
  current: 0,
  answers: emptyArrays(n),
  history: emptyArrays(n),
  choices: Array.from({ length: n }, () => null), // multiple choice: {sel, locked} | null
  visited: Array.from({ length: n }, () => false),
  review: Array.from({ length: n }, () => false),
  timerEndsAt: null,
  log: [],
  pending: null,
  submitted: false,
  submittedAt: null,
  cachedCommand: null,
  settings: { voice: true, mirror: false, rate: 0.95, earcons: true, punctuation: true, haptics: true, silenceSecs: 30, onDevice: false },
});

const LABELS = {
  START_EXAM: 'Start exam', START_ANSWER: 'Start answer', STOP_ANSWER: 'Stop answer', PAUSE: 'Pause', RESUME: 'Resume answer',
  THAT_WAS_MY_ANSWER: 'That was my answer', CONTINUE: 'Continue', CONFIRM: 'Confirm', KEEP: 'Keep', TRY_AGAIN: 'Try again',
  REPEAT_QUESTION: 'Repeat question', REPEAT: 'Repeat', READ_ANSWER: 'Read answer', EDIT_ANSWER: 'Edit answer',
  READ_SENTENCE: 'Read sentence', READ_PARAGRAPH: 'Read paragraph', INSERT_AFTER: 'Insert after sentence',
  INSERT_BEFORE: 'Insert before sentence', CLEAR_ANSWER: 'Clear answer', REPLACE_SENTENCE: 'Replace sentence',
  DELETE_SENTENCE: 'Delete sentence', ADD_TO_ANSWER: 'Add to answer', UNDO: 'Undo', DONE: 'Done', NEXT: 'Next question',
  PREV: 'Previous question', GOTO: 'Go to question', ANSWER_QUESTION: 'Answer question', REMAINING: 'Questions remaining',
  SUBMIT: 'Submit exam', HELP: 'Help', CHANGE_LANGUAGE: 'Change language', PRINT: 'Print', WHERE_AM_I: 'Where am I',
  SLOWER: 'Speak slower', FASTER: 'Speak faster', TIME_LEFT: 'Time left', REPLACE_WORD: 'Change word',
  NEXT_ITEM: 'Next', PREV_ITEM: 'Previous', NEXT_SENTENCE: 'Next sentence', PREV_SENTENCE: 'Previous sentence',
  NEXT_PARAGRAPH: 'Next paragraph', PREV_PARAGRAPH: 'Previous paragraph', GOTO_SENTENCE: 'Go to sentence',
  READ_WORDS: 'Read words', CHANGE_WORD: 'Change word', DELETE_WORD: 'Delete word', DELETE_THIS: 'Delete this sentence',
  REWRITE_THIS: 'Rewrite this sentence', ADD_AFTER_THIS: 'Add after this sentence', READ_THIS: 'Read this sentence',
  FIX_WORD: 'Fix word', REPLACE_WITH: 'Replace sentence with', ADD_AFTER_TEXT: 'Add after words',
  READ_OPTIONS: 'Read options', READ_OPTION: 'Read option', NEXT_OPTION: 'Next option', PREV_OPTION: 'Previous option',
  SELECT_OPTION: 'Pick option', LOCK_CHOICE: 'Lock answer', UNLOCK_CHOICE: 'Unlock answer', CLEAR_CHOICE: 'Clear pick',
  MY_CHOICE: 'What did I pick', MARK_REVIEW: 'Mark for review', UNMARK_REVIEW: 'Remove review mark', THINK: 'Give me time',
};
const letterOf = (k) => OPTION_LETTERS[k] || String(k + 1);
// Which language a teacher's question is written in, from its script (for the reading voice).
const SCRIPTS = [
  [/[\u0B80-\u0BFF]/u, 'ta-IN'], [/[\u0C00-\u0C7F]/u, 'te-IN'], [/[\u0C80-\u0CFF]/u, 'kn-IN'], [/[\u0D00-\u0D7F]/u, 'ml-IN'],
  [/[\u0980-\u09FF]/u, 'bn-IN'], [/[\u0A80-\u0AFF]/u, 'gu-IN'], [/[\u0A00-\u0A7F]/u, 'pa-IN'], [/[\u0B00-\u0B7F]/u, 'or-IN'],
  [/[\u0600-\u06FF]/u, 'ur-IN'], [/[\u0900-\u097F]/u, 'hi-IN'],
];
const scriptLang = (text) => (SCRIPTS.find(([re]) => re.test(text)) || [null, null])[1];
export function describeCommand(cmd) {
  if (!cmd) return null;
  if (cmd.type === 'REPLACE_WORD') return `Change "${cmd.from}" to "${cmd.to}"`;
  if (cmd.type === 'FIX_WORD') return `Fix word "${cmd.word}"`;
  if (cmd.type === 'REMOVE_WORDS') return `Remove "${cmd.words}"`;
  if (cmd.type === 'REPLACE_WITH') return `Replace ${cmd.n ? `sentence ${cmd.n === -1 ? 'last' : cmd.n}` : 'this sentence'} with "${cmd.text}"`;
  if (cmd.type === 'ADD_AFTER_TEXT') return `Add after "${cmd.anchor || cmd.rest}"`;
  if (cmd.type === 'SELECT_OPTION' && cmd.text) return `Pick "${cmd.text}"`;
  if (['SELECT_OPTION', 'READ_OPTION', 'LOCK_CHOICE'].includes(cmd.type) && cmd.n) return `${LABELS[cmd.type]} ${letterOf(cmd.n - 1)}`;
  const label = LABELS[cmd.type] || cmd.type;
  return cmd.n === undefined ? label : `${label} ${cmd.n === -1 ? 'last' : cmd.n}`;
}

export class ExamEngine {
  constructor() {
    const saved = loadSaved();
    const base = freshPersisted();
    const restored = saved ? { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } } : base;
    restored.setup = { ...DEFAULT_SETUP, ...(restored.setup || {}) };
    const n = restored.setup.questions?.length || QUESTION_COUNT;
    const pad = (arr) => Array.from({ length: n }, (_, i) => (arr && arr[i]) || []);
    restored.answers = pad(restored.answers);
    restored.history = pad(restored.history);
    const padV = (arr, v) => Array.from({ length: n }, (_, i) => (arr && arr[i] !== undefined ? arr[i] : v));
    restored.choices = padV(restored.choices, null);
    restored.visited = padV(restored.visited, false);
    restored.review = padV(restored.review, false);
    this.listeners = new Set();
    this.state = {
      ...restored,
      hasSaved: !!(saved && (saved.lang || saved.started)),
      booted: false,
      mode: MODE.IDLE,
      nextMode: null,
      paused: false,
      dictTarget: null, // {kind:'answer'} | {kind:'replace', index} | {kind:'add'}
      confirm: null, // {kind:'stop'|'lowconf'|'edit'|'submit', prompt}
      edit: null, // {q, op?, index?, proposed?}
      interim: '',
      lastHeard: '',
      prompt: '',
      mic: 'off',
      micProblem: null, // {code, text}
      failures: 0,
      simulateLowConf: false,
      understood: '',
      cursor: null, // sentence being edited (0-based)
      optionCursor: null, // option being read one at a time (0-based)
      instructing: false, // the student tapped or said "Awaaz": the next utterance is an instruction
      recordOff: false, // the student stopped recording on this written question
      thinking: false, // the student asked for time: no reminders until they speak
      heardAt: 0, // last time any speech was heard
      listenSince: 0, // when the microphone last opened
      announcement: { id: 0, text: '' },
      alert: { id: 0, text: '' },
      voiceWarning: null,
      printTarget: null,
      voicesLoaded: 0,
      permission: 'unknown',
      now: Date.now(),
    };
    this.warned = new Set();
    this.silencePrompted = false;
    this.hintCounts = {};
    this.prefixOnce = '';
    this.io = new SpeechIO({
      onFinal: (t, c, alts) => this.onFinal(t, c, alts),
      onInterim: (t) => {
        bumpLevel();
        this.set({ interim: t });
        // Ping as soon as "Awaaz" is heard, before the sentence ends, so the student knows.
        if (!this.wakePinged && !this.state.instructing && this.state.lang && findWake(t).found) {
          this.wakePinged = true;
          this.earcon('wake');
        }
      },
      onActivity: () => {
        this.set({ heardAt: Date.now() });
        this.armSilence();
      },
      onNoSpeech: () => {},
      onError: (code, fatal) => this.onRecognitionError(code, fatal),
      onStatus: (s) => this.set({ mic: s }),
      onVoices: (v) => this.set({ voicesLoaded: v.length }),
    });
    this.io.rate = this.state.settings.rate;
    this.io.voiceEnabled = this.state.settings.voice;
    this.io.processLocally = !!this.state.settings.onDevice;
    this.watchPermission();
  }

  // ---------- store plumbing ----------
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  set(patch) {
    this.state = { ...this.state, ...patch };
    if (PERSISTED_KEYS.some((k) => k in patch)) saveState(this.state);
    this.listeners.forEach((l) => l());
  }

  get questions() {
    const qs = this.state.setup?.questions;
    return qs && qs.length ? qs : QUESTIONS;
  }
  get count() {
    return this.questions.length;
  }
  qText(i, lang = this.lang) {
    const q = this.questions[i] || {};
    return q[lang] || q.text || q['en-IN'] || '';
  }
  isMcq(i = this.state.current) {
    const q = this.questions[i];
    return !!(q && q.type === 'mcq' && q.options && q.options.length);
  }
  optionTexts(i = this.state.current, lang = this.lang) {
    const q = this.questions[i];
    return (q?.options || []).map((o) => (typeof o === 'string' ? o : o[lang] || o.text || o['en-IN'] || ''));
  }
  /** 'notVisited' | 'notAnswered' | 'answered' | 'picked' (multiple choice, not locked). */
  status(i) {
    const s = this.state;
    if (this.isMcq(i)) {
      const c = s.choices[i];
      if (c && c.sel !== null && c.sel !== undefined) return c.locked ? 'answered' : 'picked';
    } else if (getSentences(s.answers[i] || []).length) return 'answered';
    return s.visited[i] ? 'notAnswered' : 'notVisited';
  }
  visit(i) {
    if (this.state.visited[i]) return;
    this.set({ visited: this.state.visited.map((v, k) => (k === i ? true : v)) });
  }

  get lang() {
    return this.state.lang || 'en-IN';
  }
  get answerLang() {
    return this.state.answerLang || this.lang;
  }
  /** Language the microphone listens in: answers in the answer language, instructions in the app's language. */
  listenLang(mode = this.state.mode) {
    return mode === MODE.DICTATING && !this.state.instructing ? this.answerLang : this.lang;
  }
  /**
   * Where the app rests between instructions: recording on a written question (unless the student
   * stopped), listening for instructions on a multiple-choice question, before the exam and after it.
   */
  home() {
    const s = this.state;
    if (!s.lang || !s.started) return MODE.LISTENING_FOR_COMMAND;
    if (s.submitted) return MODE.SUBMITTED;
    if (this.isMcq() || s.recordOff) return MODE.LISTENING_FOR_COMMAND;
    return MODE.DICTATING;
  }
  /** The question as a speech segment in the language it is written in. */
  qSeg(i) {
    const q = this.questions[i] || {};
    if (q[this.lang]) return { text: q[this.lang], lang: this.lang };
    if (q.text) return { text: q.text, lang: scriptLang(q.text) || this.state.setup.lang || this.answerLang };
    return { text: q['en-IN'] || '', lang: 'en-IN' };
  }
  m(key, ...args) {
    // Sentence text is spoken inside prompts that add their own full stop: avoid "…water.." .
    return msg(this.lang, key, ...args.map((v) => (typeof v === 'string' ? v.replace(/[.?!।॥]+$/u, '') : v)));
  }

  /** Long, instructive prompt the first two times; the short form afterwards. */
  hint(longKey, shortKey, ...args) {
    const n = (this.hintCounts[longKey] = (this.hintCounts[longKey] || 0) + 1);
    if (n <= 2) return this.m(longKey, ...args);
    return shortKey ? this.m(shortKey, ...args) : '';
  }

  /** Resolve a spoken sentence number; -1 means "last". */
  resolveN(n, total) {
    return n === -1 ? total : n;
  }

  log(type, detail = {}, q = this.state.current) {
    const entry = { ts: new Date().toISOString(), q: q === null ? null : q + 1, type, ...detail };
    this.set({ log: [...this.state.log, entry] });
  }

  announce(text) {
    this.set({ announcement: { id: this.state.announcement.id + 1, text } });
  }
  alertUser(text) {
    this.set({ alert: { id: this.state.alert.id + 1, text } });
  }

  async watchPermission() {
    try {
      const st = await navigator.permissions.query({ name: 'microphone' });
      this.set({ permission: st.state });
      st.onchange = () => this.set({ permission: st.state });
    } catch {
      /* Permissions API unavailable */
    }
  }

  // ---------- speaking & mode transitions ----------
  effectiveMode() {
    return this.state.mode === MODE.SPEAKING ? this.state.nextMode : this.state.mode;
  }

  /** Speak text (string or [{text, lang}]) then enter `next` mode. */
  say(content, next, patch = {}) {
    // Undo instead of "yes or no?": every edit except clearing a whole answer is applied at once.
    if (next === MODE.CONFIRMING && patch.confirm?.kind === 'edit' && patch.edit && patch.edit.op !== 'clear') {
      this.set({ ...patch, confirm: null, dictTarget: null });
      return this.applyEdit();
    }
    if (next === MODE.DICTATING && !patch.dictTarget && !this.state.dictTarget) patch = { ...patch, dictTarget: { kind: 'answer' }, paused: false };
    const flat = (c) => (Array.isArray(c) ? c.flatMap(flat) : typeof c === 'string' ? (c.trim() ? [{ text: c.trim(), lang: this.lang }] : []) : c && c.text ? [c] : []);
    let segs = flat(content);
    if (this.prefixOnce) {
      segs = [{ text: this.prefixOnce, lang: this.lang }, ...segs];
      this.prefixOnce = '';
    }
    const text = segs.map((s) => s.text).join(' ');
    this.clearSilence();
    this.lastPrompt = { segs, next };
    this.set({ ...patch, mode: MODE.SPEAKING, nextMode: next, prompt: text, interim: '', instructing: false });
    const spoken = segs.some((s) => this.io.canSpeak(s.lang));
    if (this.state.settings.mirror || !spoken) this.announce(text);
    this.io.speak(segs, () => this.enter(next));
  }

  enter(mode) {
    const patch = { mode, nextMode: null, listenSince: Date.now() };
    if (mode === MODE.DICTATING && !this.state.dictTarget) Object.assign(patch, { dictTarget: { kind: 'answer' }, paused: false });
    this.set(patch);
    if (LISTENING.has(mode) && !this.state.micProblem && this.io.support.recognition) {
      this.earcon(mode === MODE.DICTATING && !this.state.paused ? 'record' : 'listen');
      this.io.listen(this.listenLang(mode));
      this.armSilence();
    }
  }

  earcon(name) {
    if (this.state.settings.earcons) playEarcon(name);
    if (this.state.settings.haptics) buzz(name);
  }

  clearSilence() {
    clearTimeout(this.silenceTimer);
  }

  /**
   * One gentle reminder after a long silence, never more until the student speaks again.
   * Silence while recording an answer is thinking time, so it is never interrupted, and
   * "Let me think" switches reminders off until the student speaks.
   */
  armSilence() {
    this.clearSilence();
    const { mode, paused, thinking, settings } = this.state;
    const secs = Number(settings.silenceSecs) || 0;
    if (!secs || !LISTENING.has(mode) || mode === MODE.SUBMITTED || mode === MODE.DICTATING || paused || thinking || this.silencePrompted) return;
    this.silenceTimer = setTimeout(() => {
      const s = this.state;
      if (!LISTENING.has(s.mode) || s.mode === MODE.DICTATING || s.paused || s.thinking || this.silencePrompted) return;
      this.silencePrompted = true;
      this.log('silence_prompt', { seconds: secs });
      const text = this.m('silenceCommand');
      this.say(s.mode === MODE.CONFIRMING && s.confirm ? `${text} ${s.confirm.prompt}` : text, s.mode);
    }, secs * 1000);
  }

  // ---------- startup ----------
  async begin() {
    if (this.state.booted || this.beginning) return; // any key, a tap and the button may all fire
    this.beginning = true;
    setTimeout(() => (this.beginning = false), 1000);
    const s = this.state;
    initEarcons();
    this.set({ booted: true });
    clearInterval(this.ticker);
    this.ticker = setInterval(() => this.tick(), 1000);
    if (!this.io.support.recognition) {
      const text = this.m('errUnsupported');
      this.set({ micProblem: { code: 'unsupported', text } });
      this.alertUser(text);
    } else if (await this.requestMic()) {
      startLevel(); // live voice visual; never blocks the exam if it fails
    }
    if (s.lang && s.started) return this.resumeSession();
    const problem = this.state.micProblem?.text;
    // The teacher may fix the exam's medium (as exam forms do); then there is no language question.
    if (!s.lang && s.setup.lang) {
      const talk = LANGS.includes(s.setup.lang) ? s.setup.lang : 'en-IN';
      this.set({ lang: talk, answerLang: s.setup.lang });
      this.log('language_selected', { language: answerLangName(s.setup.lang).en, by: 'teacher' }, null);
      if (talk !== s.setup.lang) return this.say(`${problem ? problem + ' ' : ''}${this.m('answerLangSelected', answerLangName(s.setup.lang).en)}`, MODE.LISTENING_FOR_COMMAND);
    }
    if (this.state.lang) return this.say(`${problem ? problem + ' ' : ''}${this.m('langSelected')}`, MODE.LISTENING_FOR_COMMAND);
    this.welcome(problem);
  }

  async requestMic() {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this.set({ permission: 'granted' });
      return true;
    } catch (e) {
      const code = e && (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') ? 'audio-capture' : 'not-allowed';
      this.onRecognitionError(code, true, { silent: true });
      return false;
    }
  }

  welcome(problem) {
    if (this.state.setup.lang) return this.say(this.m('langLocked'), this.effectiveMode() || MODE.LISTENING_FOR_COMMAND);
    this.say(
      [
        ...(problem ? [{ text: problem, lang: 'en-IN' }] : []),
        { text: msg('en-IN', 'welcome'), lang: 'en-IN' },
        { text: msg('hi-IN', 'welcome'), lang: 'hi-IN' },
        { text: msg('ta-IN', 'welcome'), lang: 'ta-IN' },
      ],
      MODE.LISTENING_FOR_COMMAND,
      { lang: null },
    );
  }

  resumeSession() {
    const s = this.state;
    if (s.submitted) return this.say(`${this.m('welcomeBack')} ${this.m('locked')}`, MODE.SUBMITTED);
    if (s.pending) {
      const prompt = this.m('lowConf', s.pending.text);
      return this.say(`${this.m('welcomeBack')} ${prompt}`, MODE.CONFIRMING, {
        confirm: { kind: 'lowconf', prompt },
        dictTarget: { kind: 'answer' },
        current: s.pending.q,
      });
    }
    this.say([this.m('welcomeBack'), this.questionText(s.current)], this.home());
  }

  async retryMic() {
    this.set({ micProblem: null, failures: 0 });
    this.io.resetErrors();
    const ok = await this.requestMic();
    if (ok) this.enter(this.effectiveMode() || MODE.LISTENING_FOR_COMMAND);
  }

  selectLanguage(lang) {
    const fixed = this.state.setup.lang;
    if (fixed && lang !== fixed) return this.say(msg(fixed, 'langLocked'), this.effectiveMode() || MODE.LISTENING_FOR_COMMAND);
    this.io.cancel();
    const keepAnswer = this.state.answerLang && !LANGS.includes(this.state.answerLang);
    this.set({ lang, answerLang: keepAnswer ? this.state.answerLang : lang, micProblem: this.state.micProblem?.code === 'language-not-supported' ? null : this.state.micProblem });
    this.log('language_selected', { language: LANG_NAMES[lang].en }, null);
    let warning = null;
    if (this.io.support.synthesis && this.io.voices.length && !this.io.hasVoice(lang)) {
      warning = `No ${LANG_NAMES[lang].en} speech voice is installed on this computer. Prompts in ${LANG_NAMES[lang].en} will be shown on screen and sent to your screen reader instead of being spoken.`;
      this.alertUser(warning);
    }
    this.set({ voiceWarning: warning });
    if (this.state.started) return this.say([`${this.m('langSelected').split('.')[0]}.`, this.questionText(this.state.current)], this.home());
    this.say(this.m('langSelected'), MODE.LISTENING_FOR_COMMAND);
  }

  /** Answer in any Indian language the speech engine knows; the app keeps talking in English, Hindi or Tamil. */
  selectAnswerLanguage(code) {
    const fixed = this.state.setup.lang;
    if (fixed && code !== fixed) return this.say(this.m('langLocked'), this.effectiveMode() || MODE.LISTENING_FOR_COMMAND);
    if (LANGS.includes(code)) return this.selectLanguage(code);
    this.io.cancel();
    this.set({ lang: this.state.lang || 'en-IN', answerLang: code });
    this.log('answer_language_selected', { language: answerLangName(code).en }, null);
    if (this.state.started) return this.say([this.m('answerLangSelected', answerLangName(code).en).split('.')[0] + '.', this.questionText(this.state.current)], this.home());
    this.say(this.m('answerLangSelected', answerLangName(code).en), MODE.LISTENING_FOR_COMMAND);
  }

  // ---------- the one way to talk to the app: tap, Space, or "Awaaz" ----------
  /** The student tapped, pressed Space or said "Awaaz": stop talking, take one instruction. */
  wake(source = 'tap') {
    const s = this.state;
    if (!s.booted || s.mode === MODE.IDLE) return;
    if (s.mode === MODE.SPEAKING) this.io.cancel(); // interrupt the app
    const back = this.effectiveMode() || this.home();
    this.set({ mode: back, nextMode: null, instructing: true, interim: '', listenSince: Date.now() });
    this.clearSilence();
    this.earcon('wake');
    this.log('instruction_requested', { source });
    if (!s.micProblem && this.io.support.recognition) this.io.listen(this.lang);
    clearTimeout(this.wakeTimer);
    // Nothing said for 8 seconds: go back quietly to what the app was doing.
    this.wakeTimer = setTimeout(() => {
      if (!this.state.instructing) return;
      this.set({ instructing: false });
      this.earcon('back');
      this.enter(this.effectiveMode() || this.home());
    }, 8000);
  }

  /** One instruction, understood generously: the student has told us it is not answer text. */
  instruction(text, alts) {
    clearTimeout(this.wakeTimer);
    const s = this.state;
    this.set({ instructing: false });
    const mode = this.effectiveMode() || this.home();
    let cmd = null;
    if (mode === MODE.CONFIRMING) {
      const yn = alts.map(parseYesNo).find(Boolean);
      cmd = parseCommandAlternatives(alts, s.lang, { strict: true }) || (yn ? { type: yn === 'yes' ? 'CONFIRM' : 'TRY_AGAIN' } : null);
    }
    if (!cmd) cmd = this.understand(text, alts);
    this.set({ understood: describeCommand(cmd) || '—' });
    this.log('instruction', { heard: text, understood: cmd ? describeCommand(cmd) : null });
    if (!cmd) {
      this.earcon('error');
      return this.say(this.m('instrUnknown'), mode === MODE.SPEAKING ? this.home() : mode);
    }
    if (mode === MODE.DICTATING) return this.dictationInstruction(cmd, text);
    this.command(cmd, 'voice');
  }

  /** An instruction given while recording an answer. */
  dictationInstruction(cmd, phrase) {
    const s = this.state;
    const target = s.dictTarget || { kind: 'answer' };
    if (target.kind !== 'answer') {
      if (['STOP_ANSWER', 'DONE', 'PAUSE', 'UNDO'].includes(cmd.type)) return this.say(this.m('editCancelled'), MODE.EDIT_COMMAND, { dictTarget: null, edit: { q: s.current } });
      this.set({ mode: MODE.EDIT_COMMAND, nextMode: null, dictTarget: null, edit: { q: s.current } });
      return this.command(cmd, 'voice');
    }
    switch (cmd.type) {
      case 'STOP_ANSWER':
      case 'PAUSE':
      case 'DONE':
        return this.finishAnswer();
      case 'UNDO':
        return this.undoInDictation();
      case 'START_ANSWER':
      case 'RESUME':
        return this.say(this.m('alreadyRecording', s.current + 1), MODE.DICTATING);
      case 'THINK':
        this.set({ thinking: true });
        return this.say(this.m('thinkingShort'), MODE.DICTATING);
      case 'REPEAT_QUESTION':
        return this.say(this.questionOnly(s.current), MODE.DICTATING);
      case 'THAT_WAS_MY_ANSWER':
        return this.restoreCached();
      default:
        if (this.utility(cmd, MODE.DICTATING)) return;
        return this.leaveDictationFor(cmd, phrase, false);
    }
  }

  // ---------- recognition input ----------
  onFinal(text, confidence, alts) {
    const s = this.state;
    alts = alts && alts.length ? alts : [text];
    if (s.mode === MODE.SPEAKING || s.mode === MODE.IDLE) return;
    this.set({ lastHeard: text, interim: '' });
    if (!text.trim()) return this.recognitionFailure('empty_transcript');
    this.silencePrompted = false;
    if (s.thinking) this.set({ thinking: false });
    if (s.lang && isFiller(text)) {
      // "Hmm", "umm": the student is thinking aloud. Not answer text, not an error.
      this.log('thinking_sound', { heard: text });
      this.set({ understood: '…' });
      return this.armSilence();
    }
    this.armSilence();
    let conf = confidence;
    if (s.simulateLowConf) {
      conf = 0.4;
      this.set({ simulateLowConf: false });
    }
    if (s.failures) this.set({ failures: 0 });

    // "Awaaz …": the rest is an instruction ("Awaaz" alone waits for one). Words said before it,
    // in the same breath, are still answer text.
    this.wakePinged = false;
    // Check every alternative the recogniser offers: the wake word is sometimes only in the second.
    const wkAlt = alts.map((a) => ({ a, w: findWake(a) })).find((x) => x.w.found);
    const wk = wkAlt ? wkAlt.w : findWake(text);
    if (wk.found && s.lang) {
      if (wk.before && s.mode === MODE.DICTATING && !s.instructing) this.dictationInput(wk.before, confidence, [wk.before]);
      const otherScript = this.listenLang() !== this.lang && !parseInstruction(wk.rest, s.lang);
      if (!wk.rest || otherScript) return this.wake('voice');
      const rest = alts.map((a) => findWake(a)).filter((w) => w.found && w.rest).map((w) => w.rest);
      return this.instruction(wk.rest, rest.length ? rest : [wk.rest]);
    }
    if (s.instructing) return this.instruction(text, alts);

    if (!s.lang) {
      const lang = parseLanguage(text);
      if (lang) return LANGS.includes(lang) ? this.selectLanguage(lang) : this.selectAnswerLanguage(lang);
      const cmd = parseCommand(text, 'en-IN');
      if (cmd?.type === 'HELP') return this.say(helpText('en-IN', 'language'), MODE.LISTENING_FOR_COMMAND);
      if (cmd?.type === 'REPEAT') return this.repeatPrompt();
      return this.say(
        [
          { text: msg('en-IN', 'langNotUnderstood'), lang: 'en-IN' },
          { text: msg('hi-IN', 'langNotUnderstood'), lang: 'hi-IN' },
          { text: msg('ta-IN', 'langNotUnderstood'), lang: 'ta-IN' },
        ],
        MODE.LISTENING_FOR_COMMAND,
      );
    }
    if (s.mode === MODE.DICTATING) return this.dictationInput(text, conf, alts);
    let cmd;
    if (s.mode === MODE.CONFIRMING) {
      // Exact phrases first ("continue exam", "keep"), then any yes / no word, then the lenient parser.
      cmd = parseCommandAlternatives(alts, s.lang, { strict: true });
      if (!cmd || !['CONFIRM', 'KEEP', 'TRY_AGAIN', 'CONTINUE', 'RESUME', 'DONE', 'REPEAT', 'THAT_WAS_MY_ANSWER', 'HELP', 'STOP_ANSWER', 'SUBMIT', 'LOCK_CHOICE', 'THINK'].includes(cmd.type)) {
        const yn = alts.map(parseYesNo).find(Boolean);
        if (yn) cmd = { type: yn === 'yes' ? 'CONFIRM' : 'TRY_AGAIN' };
      }
      cmd = cmd || parseCommandAlternatives(alts, s.lang);
    } else {
      cmd = this.understand(text, alts);
    }
    this.set({ understood: describeCommand(cmd) || '—' });
    if (!cmd) return this.unknown();
    this.command(cmd, 'voice');
  }

  recognitionFailure(kind) {
    const failures = this.state.failures + 1;
    this.set({ failures });
    this.earcon('error');
    this.log('recognition_error', { detail: kind });
    const mode = this.effectiveMode() || MODE.LISTENING_FOR_COMMAND;
    const text = this.m('notHeard') + (failures >= 2 ? ` ${this.m('headsetAdvice')}` : '');
    this.say(text, mode);
  }

  onRecognitionError(code, fatal, opts = {}) {
    const keyFor = {
      'not-allowed': 'errPermission',
      'service-not-allowed': 'errPermission',
      network: fatal ? 'errNetworkStop' : 'errNetwork',
      'language-not-supported': 'errLanguage',
      'audio-capture': 'errNoMic',
    };
    if (!fatal) {
      if (code === 'network') {
        this.log('recognition_error', { detail: code });
        const failures = this.state.failures + 1;
        this.set({ failures });
        return this.say(this.m('errNetwork') + (failures >= 2 ? ` ${this.m('headsetAdvice')}` : ''), this.effectiveMode() || MODE.LISTENING_FOR_COMMAND);
      }
      return this.recognitionFailure(code);
    }
    const offlineMissing = this.state.settings.onDevice && (code === 'service-not-allowed' || code === 'language-not-supported');
    const text = this.m(offlineMissing ? 'errOnDevice' : keyFor[code] || 'notHeard');
    this.io.stopListening();
    this.set({ micProblem: { code, text } });
    this.earcon('error');
    this.log('recognition_error', { detail: code, fatal: true });
    this.alertUser(text);
    if (!opts.silent) this.say(text, this.effectiveMode() || MODE.LISTENING_FOR_COMMAND);
  }

  simulateError() {
    this.log('simulated_error', {});
    this.recognitionFailure('simulated_transcription_error');
  }

  unknown() {
    const mode = this.effectiveMode();
    if (mode === MODE.CONFIRMING) return this.say(this.state.confirm.prompt, MODE.CONFIRMING);
    if (mode === MODE.SUBMITTED) return this.say(this.m('locked'), MODE.SUBMITTED);
    this.earcon('error');
    this.say(this.m(this.state.started && this.isMcq() ? 'instrUnknownMcq' : 'instrUnknown'), mode);
  }

  // ---------- dictation ----------
  dictationInput(text, conf, alts = [text]) {
    const s = this.state;
    const target = s.dictTarget || { kind: 'answer' };
    const dc = alts.map((a) => parseDictationCommand(a, s.lang)).find(Boolean) || null;
    const raw = text;
    if (!dc && s.settings.punctuation) text = applySpokenPunctuation(text);

    if (target.kind !== 'answer') {
      // Dictating a replacement, insertion or addition: the next utterance is the new text.
      if (dc?.type === 'STOP_ANSWER') return this.say(this.m('editCancelled'), MODE.EDIT_COMMAND, { dictTarget: null, edit: { q: s.current } });
      const asCmd = parseCommand(raw, s.lang, { strict: true });
      const nWords = normalize(raw).split(' ').length;
      if (asCmd && nWords >= 2 && !NOT_IN_DICTATION.has(asCmd.type) && asCmd.type !== 'REPLACE_WORD') {
        // The student changed their mind ("delete sentence 1" instead of a new sentence).
        this.log('edit_cancelled', { by: asCmd.type });
        this.set({ mode: MODE.EDIT_COMMAND, nextMode: null, dictTarget: null, edit: { q: s.current }, understood: describeCommand(asCmd) });
        return this.command(asCmd, 'voice');
      }
      const e = s.edit;
      if (target.kind === 'word') {
        const sents = getSentences(s.answers[s.current]);
        const proposed = replaceWordsAt(sents[target.sentence], target.start, target.len, text.replace(/[.?!।]+$/u, ''));
        const prompt = this.m('confirmSentence', target.sentence + 1, proposed);
        this.log('edit_proposed', { op: 'word', sentence: target.sentence + 1, text });
        return this.say(prompt, MODE.CONFIRMING, { confirm: { kind: 'edit', prompt }, edit: { ...e, proposed }, dictTarget: null });
      }
      const prompt =
        target.kind === 'replace' ? this.m('confirmReplace', target.index + 1, text)
          : target.kind === 'insert' ? this.m('confirmInsert', target.index + 1, text)
            : this.m('confirmAdd', text);
      this.log('edit_proposed', { op: target.kind, sentence: target.index !== undefined ? target.index + 1 : null, text });
      return this.say(prompt, MODE.CONFIRMING, { confirm: { kind: 'edit', prompt }, edit: { ...e, proposed: text }, dictTarget: null });
    }

    if (s.paused) {
      if (dc?.type === 'RESUME') return this.resumeDictation();
      if (dc?.type === 'STOP_ANSWER') return this.requestStop(raw);
      if (dc?.type === 'THAT_WAS_MY_ANSWER') return this.restoreCached();
      const cmd = parseCommandAlternatives(alts, s.lang);
      if (cmd && this.utility(cmd, MODE.DICTATING)) return;
      if (cmd?.type === 'HELP') return this.say(helpText(s.lang, 'dictation'), MODE.DICTATING);
      if (cmd?.type === 'REPEAT_QUESTION') return this.say(this.questionOnly(s.current), MODE.DICTATING);
      if (cmd?.type === 'READ_ANSWER' && !cmd.n) return this.readAnswer(s.current, MODE.DICTATING, false);
      if (cmd && !NOT_IN_DICTATION.has(cmd.type)) return this.leaveDictationFor(cmd, raw);
      return this.say(this.m('pausedHint'), MODE.DICTATING);
    }

    if (dc) this.set({ understood: describeCommand(dc) });
    if (dc?.type === 'STOP_ANSWER') return this.requestStop(raw);
    if (dc?.type === 'THAT_WAS_MY_ANSWER') return this.restoreCached();
    // "stop and research" (a misheard "stop answer"): a short utterance that starts with a stop word.
    // Only when the words after "stop" sound like "answer"/"recording": "stop air pollution" is answer text.
    if (this.isMisheardStop(raw)) {
      this.set({ understood: describeCommand({ type: 'STOP_ANSWER' }) });
      return this.requestStop(raw);
    }
    const whole = parseCommand(raw, s.lang, { strict: true });
    if (whole?.type === 'THINK') {
      // Recording stays on; nothing is written. Silence while recording is never interrupted anyway.
      this.log('thinking_time', { phrase: raw });
      this.set({ understood: describeCommand(whole), thinking: true });
      return this.say(this.m('thinkingShort'), MODE.DICTATING);
    }
    if (whole?.type === 'DONE') return this.requestStop(raw); // "done" / "हो गया" while recording means stop
    if (dc?.type === 'PAUSE') {
      this.log('paused', { phrase: raw });
      return this.say(this.m('paused'), MODE.DICTATING, { paused: true, cachedCommand: { text: raw, q: s.current } });
    }

    // Any other whole-utterance command (e.g. "Read my answer", "Go to question 4").
    const cmd = parseCommand(raw, s.lang, { strict: true });
    const words = normalize(raw).split(' ').length;
    if (cmd && !NOT_IN_DICTATION.has(cmd.type) && (words >= 2 || ONE_WORD_OK_IN_DICTATION.has(cmd.type))) {
      if (cmd.type === 'UNDO') return this.undoInDictation();
      if (cmd.type === 'START_ANSWER') return this.say(this.m('alreadyRecording', s.current + 1), MODE.DICTATING);
      if (cmd.type === 'REPLACE_WITH' && !cmd.n) {
        // "replace this with …" needs a sentence picked in edit mode; keep it as answer text here.
      } else if (cmd.type === 'REPLACE_WORD' && !replaceWord(s.answers[s.current], cmd.from, cmd.to) && !this.findSpoken(cmd.from)) {
        // "replace the bulb with a new one" is answer text unless the word is in the answer.
      } else if (cmd.type === 'REMOVE_WORDS' && !this.findSpoken(cmd.words)) {
        // "replace the bulb with a new one" is answer text unless the word is in the answer.
      } else {
        return this.leaveDictationFor(cmd, raw);
      }
    }
    if (raw !== text) this.log('spoken_punctuation', { heard: raw, written: text });
    this.set({ understood: isOnlyPunctuation(text) ? (text.includes('\n') ? 'New paragraph' : 'Punctuation') : 'Answer text' });
    this.addChunk(text, conf);
  }

  isMisheardStop(raw) {
    const w = normalize(raw).split(' ');
    if (!/^(?:stop|stopp|स्टॉप|बस|ஸ்டாப்|நிறுத்து)$/u.test(w[0]) || w.length > 3) return false;
    const tail = w.slice(1).join(' ');
    if (!tail) return true;
    const KNOWN = ['answer', 'answers', 'answering', 'the answer', 'my answer', 'and research', 'and answer', 'an answer', 'and sir', 'recording', 'the recording', 'record', 'dictation', 'writing', 'it', 'now', 'please', 'here', 'हो गया', 'करो'];
    if (KNOWN.includes(tail)) return true;
    return ['answer', 'recording', 'my answer'].some((t) => similarity(tail, t) >= 0.6);
  }

  /** Save the answer, then run a command spoken during dictation. "That was my answer" undoes this. */
  leaveDictationFor(cmd, phrase, cache = true) {
    const s = this.state;
    this.set({ understood: describeCommand(cmd) });
    this.log('answer_saved', { sentences: getSentences(s.answers[s.current]).length, by: cmd.type });
    this.earcon('saved');
    this.set({ mode: MODE.LISTENING_FOR_COMMAND, nextMode: null, paused: false, dictTarget: null, cachedCommand: cache ? { text: phrase, q: s.current } : s.cachedCommand });
    this.command(cmd, 'voice');
  }

  undoInDictation() {
    const q = this.state.current;
    if (this.lastAction === 'edit' && this.state.history[q].length) {
      this.lastAction = null;
      return this.undo(q, MODE.DICTATING);
    }
    return this.undoLastChunk();
  }

  undoLastChunk() {
    const s = this.state;
    const q = s.current;
    const cur = s.answers[q];
    if (!cur.length) return this.say(this.m('nothingToUndo'), MODE.DICTATING);
    const removed = cur[cur.length - 1];
    const history = s.history.map((h, i) => (i === q ? [...h, cur] : h));
    const answers = s.answers.map((a, i) => (i === q ? a.slice(0, -1) : a));
    this.set({ answers, history });
    this.log('chunk_removed', { text: removed }, q);
    this.say(this.m('removedLast', removed.trim()), MODE.DICTATING);
  }

  addChunk(text, conf) {
    const q = this.state.current;
    if (conf > 0 && conf < LOW_CONFIDENCE) {
      // Kept as heard and marked in the log; the student reviews it later instead of being stopped now.
      this.log('uncertain_chunk_kept', { text, confidence: Number(conf.toFixed(2)) });
      this.set({ understood: 'Answer text (unsure – check when you read it back)' });
    }
    this.appendChunk(q, text, conf);
    this.earcon('tick');
  }

  appendChunk(q, text, conf) {
    const cur = this.state.answers[q];
    if (isOnlyPunctuation(text)) {
      // "Full stop" said on its own: attach the mark to the previous chunk.
      if (!cur.length) return;
      const mark = text.includes('\n') ? text.replace(/[ \t]/g, '') : text.replace(/\s/g, '');
      const answers = this.state.answers.map((a, i) => (i === q ? [...a.slice(0, -1), a[a.length - 1] + mark] : a));
      this.set({ answers });
      this.log('punctuation_added', { mark }, q);
      return;
    }
    const answers = this.state.answers.map((a, i) => (i === q ? [...a, text] : a));
    this.lastAction = 'chunk';
    this.set({ answers });
    this.log('dictation_chunk', { text, confidence: conf ? Number(conf.toFixed(2)) : null }, q);
  }

  startAnswer() {
    const s = this.state;
    if (s.submitted) return this.say(this.m('locked'), MODE.SUBMITTED);
    const n = s.current + 1;
    const has = s.answers[s.current].length > 0;
    this.log('recording_started', {});
    this.say(this.m(has ? 'recordingContinue' : 'recording', n), MODE.DICTATING, {
      recordOff: false,
      paused: false,
      dictTarget: { kind: 'answer' },
      edit: null,
      cachedCommand: null,
    });
  }

  requestStop(phrase) {
    this.log('stop_requested', { phrase });
    this.finishAnswer(phrase ? { text: phrase, q: this.state.current } : null);
  }

  resumeDictation() {
    this.log('resumed', {});
    this.say(this.m('resumed', this.state.current + 1), MODE.DICTATING, { paused: false, confirm: null, dictTarget: { kind: 'answer' } });
  }

  restoreCached() {
    const s = this.state;
    const c = s.cachedCommand;
    if (!c) return this.say(this.m('nothingToRestore'), this.effectiveMode() || MODE.LISTENING_FOR_COMMAND);
    const p = typeof c === 'string' ? c : c.text;
    const q = typeof c === 'string' || c.q === undefined ? s.current : c.q;
    this.appendChunk(q, p, null);
    this.log('restored_command_phrase', { text: p }, q);
    this.say(this.m('restoredPhrase', p), MODE.DICTATING, { current: q, cachedCommand: null, paused: false, confirm: null, edit: null, dictTarget: { kind: 'answer' }, recordOff: false });
  }

  finishAnswer(cached = null) {
    this.earcon('saved');
    this.log('answer_saved', { sentences: getSentences(this.state.answers[this.state.current]).length });
    this.say(this.hint('answerSaved', 'answerSavedShort'), MODE.LISTENING_FOR_COMMAND, { paused: false, dictTarget: null, confirm: null, cachedCommand: cached, recordOff: true });
  }

  // ---------- command dispatch (voice and buttons) ----------
  command(cmd, source = 'button') {
    if (source === 'button') {
      this.log('control_pressed', { command: cmd.type, n: cmd.n ?? null });
      if (LABELS[cmd.type]) this.set({ understood: describeCommand(cmd) });
    }
    if (cmd.type === 'STOP_SPEAKING') return this.io.skip();
    if (this.state.instructing) {
      clearTimeout(this.wakeTimer);
      this.set({ instructing: false });
    }
    if (this.state.mode === MODE.SPEAKING) this.io.cancel();
    if (cmd.type === 'SELECT_LANGUAGE') return this.selectLanguage(cmd.lang);
    if (cmd.type === 'SIMULATE_ERROR') return this.simulateError();
    const mode = this.effectiveMode() || MODE.LISTENING_FOR_COMMAND;
    if (this.utility(cmd, mode)) return;
    // In a confirmation, "Repeat" means "discard / try again", so it is handled there.
    if (cmd.type === 'THINK' && mode !== MODE.DICTATING) return this.giveTime(mode);
    if (mode === MODE.CONFIRMING) return this.confirmCommand(cmd.type === 'LOCK_CHOICE' && !cmd.n ? { type: 'CONFIRM' } : cmd);
    if (cmd.type === 'REPEAT') return this.repeatPrompt();
    switch (mode) {
      case MODE.DICTATING:
        return this.dictationButton(cmd);
      case MODE.SUBMITTED:
        return this.submittedCommand(cmd);
      case MODE.EDIT_COMMAND:
        if (this.editCommand(cmd)) return;
        this.set({ edit: null });
        break;
      default:
    }
    this.generalCommand(cmd);
  }

  /** Status, speed and time commands that work in every state. Returns true if handled. */
  utility(cmd, mode) {
    const s = this.state;
    const keep = (text) => this.say(mode === MODE.CONFIRMING && s.confirm ? `${text} ${s.confirm.prompt}` : text, mode);
    switch (cmd.type) {
      case 'WHERE_AM_I': {
        if (!s.lang) {
          this.say(helpText('en-IN', 'language'), mode);
          return true;
        }
        if (!s.started) {
          this.say(this.m('startExamFirst'), mode);
          return true;
        }
        const { answered } = this.counts();
        const c = s.choices[s.current];
        let text = this.isMcq()
          ? this.m('whereAmIChoice', s.current + 1, this.count, answered, this.m('choiceState', c && c.sel !== null ? letterOf(c.sel) : null, c?.locked))
          : this.m('whereAmI', s.current + 1, this.count, answered, getSentences(s.answers[s.current]).length);
        if (s.timerEndsAt && !s.submitted) text += ` ${this.m('timeLeft', this.secondsLeft())}`;
        if (mode === MODE.DICTATING && s.paused) text += ` ${this.m('pausedHint')}`;
        if (mode === MODE.SUBMITTED) text += ` ${this.m('locked')}`;
        keep(text);
        return true;
      }
      case 'SLOWER':
      case 'FASTER': {
        const step = cmd.type === 'SLOWER' ? -0.15 : 0.15;
        const rate = Math.round(Math.min(1.6, Math.max(0.6, s.settings.rate + step)) * 100) / 100;
        this.updateSettings({ rate });
        this.log('speech_rate', { rate });
        keep(this.m(cmd.type === 'SLOWER' ? 'slower' : 'faster'));
        return true;
      }
      case 'TIME_LEFT':
        keep(s.timerEndsAt && !s.submitted ? this.m('timeLeft', this.secondsLeft()) : this.m('noTimer'));
        return true;
      default:
        return false;
    }
  }

  secondsLeft() {
    return Math.max(0, Math.ceil((this.state.timerEndsAt - Date.now()) / 1000));
  }

  tick() {
    const s = this.state;
    this.set({ now: Date.now() });
    if (!s.timerEndsAt || s.submitted || !s.started) return;
    if (s.mode === MODE.SPEAKING) return; // never cut off a prompt; warn right after it
    const secs = this.secondsLeft();
    const mode = this.effectiveMode();
    if (secs <= 0) {
      if (this.warned.has('up')) return;
      this.warned.add('up');
      this.log('time_up', {}, null);
      this.earcon('error');
      this.requestSubmit(this.m('timeUp'));
      return;
    }
    for (const w of [300, 60]) {
      if (secs <= w && secs > w - 30 && !this.warned.has(w)) {
        this.warned.add(w);
        this.log('time_warning', { minutes: w / 60 }, null);
        const text = this.m('timeWarning', w / 60);
        this.say(mode === MODE.CONFIRMING && s.confirm ? `${text} ${s.confirm.prompt}` : text, mode);
        return;
      }
    }
  }

  repeatPrompt() {
    if (!this.lastPrompt) return;
    const { segs, next } = this.lastPrompt;
    this.say(segs, next);
  }

  dictationButton(cmd) {
    const s = this.state;
    const target = s.dictTarget || { kind: 'answer' };
    if (target.kind !== 'answer') {
      if (cmd.type === 'STOP_ANSWER' || cmd.type === 'DONE') return this.say(this.m('editCancelled'), MODE.EDIT_COMMAND, { dictTarget: null, edit: { q: s.current } });
      if (cmd.type === 'HELP') return this.say(helpText(s.lang, 'edit'), MODE.DICTATING);
      return this.say(this.m(target.kind === 'replace' ? 'replacePrompt' : 'addPrompt', target.index + 1, getSentences(s.answers[s.current])[target.index]), MODE.DICTATING);
    }
    switch (cmd.type) {
      case 'STOP_ANSWER':
        return this.requestStop(null);
      case 'PAUSE':
        if (s.paused) return this.resumeDictation();
        this.log('paused', {});
        return this.say(this.m('paused'), MODE.DICTATING, { paused: true, cachedCommand: null });
      case 'RESUME':
        return this.resumeDictation();
      case 'THAT_WAS_MY_ANSWER':
        return this.restoreCached();
      case 'HELP':
        return this.say(helpText(s.lang, 'dictation'), MODE.DICTATING);
      case 'REPEAT_QUESTION':
        return this.say(this.questionOnly(s.current), MODE.DICTATING);
      case 'UNDO':
        return this.undoInDictation();
      case 'READ_ANSWER':
        if (!cmd.n) return this.readAnswer(s.current, MODE.DICTATING, false);
        return this.leaveDictationFor(cmd, null, false);
      case 'THINK':
        this.set({ thinking: true });
        return this.say(this.m('thinkingShort'), MODE.DICTATING);
      default:
        if (this.utility(cmd, MODE.DICTATING)) return;
        // Any other button while recording: the answer is kept, then the button does its job.
        return this.leaveDictationFor(cmd, null, false);
    }
  }

  confirmCommand(cmd) {
    const s = this.state;
    const c = s.confirm;
    if (!c) return this.enter(MODE.LISTENING_FOR_COMMAND);
    if (cmd.type === 'HELP') return this.say(`${helpText(s.lang, 'confirm')} ${c.prompt}`, MODE.CONFIRMING);
    const t = cmd.type;
    switch (c.kind) {
      case 'stop':
        if (t === 'CONFIRM' || t === 'STOP_ANSWER') return this.finishAnswer();
        if (t === 'CONTINUE' || t === 'RESUME' || t === 'TRY_AGAIN') return this.resumeDictation();
        if (t === 'THAT_WAS_MY_ANSWER') return this.restoreCached();
        break;
      case 'lowconf': {
        const p = s.pending;
        if (t === 'KEEP' || t === 'CONFIRM') {
          if (p) this.appendChunk(p.q, p.text, p.confidence);
          this.log('uncertain_kept', { text: p?.text });
          return this.say(this.m('kept'), MODE.DICTATING, { pending: null, confirm: null, paused: false, dictTarget: { kind: 'answer' } });
        }
        if (t === 'REPEAT' || t === 'TRY_AGAIN' || t === 'REPEAT_QUESTION') {
          this.log('uncertain_discarded', { text: p?.text });
          return this.say(this.m('discarded'), MODE.DICTATING, { pending: null, confirm: null, paused: false, dictTarget: { kind: 'answer' } });
        }
        break;
      }
      case 'edit': {
        const e = s.edit;
        if (t === 'CONFIRM') return this.applyEdit();
        if (t === 'TRY_AGAIN' || t === 'REPEAT') {
          if (e.op === 'replace') return this.beginReplace(e.index);
          if (e.op === 'add') return this.beginAdd();
          if (e.op === 'insert') return this.beginInsert(e.index, e.before);
          if (e.op === 'sentence' && e.word) return this.beginWordChange(e.index, e.word.start, e.word.len);
          return this.say(this.m('editCancelled'), MODE.EDIT_COMMAND, { confirm: null, edit: { q: e.q } });
        }
        if (t === 'DONE' || t === 'CONTINUE') return this.say(this.m('editCancelled'), MODE.EDIT_COMMAND, { confirm: null, edit: { q: e.q } });
        break;
      }
      case 'submit':
        if (t === 'CONFIRM' || t === 'SUBMIT') return this.doSubmit();
        if (t === 'CONTINUE' || t === 'DONE' || t === 'TRY_AGAIN' || t === 'RESUME') {
          this.log('submission_cancelled', {});
          return this.say(this.m('continueExam'), MODE.LISTENING_FOR_COMMAND, { confirm: null });
        }
        break;
      default:
    }
    this.say(c.prompt, MODE.CONFIRMING);
  }

  generalCommand(cmd) {
    const s = this.state;
    const L = this.home();
    if (!s.lang) return this.say(helpText('en-IN', 'language'), L);
    if (!s.started) {
      if (cmd.type === 'START_EXAM' || cmd.type === 'START_ANSWER') return this.startExam();
      if (cmd.type === 'HELP') return this.say(this.m('startExamFirst'), L);
      if (cmd.type === 'CHANGE_LANGUAGE') return this.welcome();
      return this.say(this.m('startExamFirst'), L);
    }
    if (cmd.type === 'MARK_REVIEW' || cmd.type === 'UNMARK_REVIEW') return this.markReview(cmd.type === 'MARK_REVIEW', L);
    if (this.isMcq()) {
      const handled = this.choiceCommand(cmd, L);
      if (handled) return;
    } else if (MCQ_TYPES.has(cmd.type)) return this.say(this.m('notMcq'), L);
    if (EDIT_TYPES.has(cmd.type)) {
      if (s.submitted) return this.say(this.m('locked'), MODE.SUBMITTED);
      this.set({ edit: { q: s.current } });
      this.editCommand(cmd);
      return;
    }
    if (cmd.type === 'NEXT_ITEM') cmd = { type: 'NEXT' };
    if (cmd.type === 'PREV_ITEM') cmd = { type: 'PREV' };
    switch (cmd.type) {
      case 'START_EXAM':
      case 'REPEAT_QUESTION':
        return this.say(this.questionOnly(s.current), L);
      case 'START_ANSWER':
        return this.startAnswer();
      case 'READ_ANSWER':
        return this.readAnswer(cmd.n ? cmd.n - 1 : s.current, L, true);
      case 'EDIT_ANSWER':
        if (cmd.n) {
          if (cmd.n < 1 || cmd.n > this.count) return this.say(this.m('noSuchQuestion', this.count), L);
          this.set({ current: cmd.n - 1 });
        }
        return this.openEdit();
      case 'ANSWER_QUESTION':
        if (!cmd.n || cmd.n < 1 || cmd.n > this.count) return this.say(this.m('noSuchQuestion', this.count), L);
        this.log('navigated', { to: cmd.n });
        this.set({ current: cmd.n - 1, recordOff: false });
        this.visit(cmd.n - 1);
        return this.startAnswer();
      case 'THAT_WAS_MY_ANSWER':
        return this.restoreCached();
      case 'NEXT':
        if (s.current >= this.count - 1) return this.say(this.m('lastQuestion'), L);
        return this.goto(s.current + 1);
      case 'PREV':
        if (s.current <= 0) return this.say(this.m('firstQuestion'), L);
        return this.goto(s.current - 1);
      case 'GOTO':
        if (!cmd.n || cmd.n < 1 || cmd.n > this.count) return this.say(this.m('noSuchQuestion', this.count), L);
        return this.goto(cmd.n - 1);
      case 'REMAINING': {
        const { answered, unanswered } = this.counts();
        return this.say(this.m('remaining', answered, unanswered.length, unanswered), L);
      }
      case 'SUBMIT':
        return this.requestSubmit();
      case 'HELP':
        return this.say(`${helpText(s.lang, 'command')} ${this.m('skipHint')}`, L);
      case 'CHANGE_LANGUAGE':
        return this.welcome();
      case 'PRINT':
        return this.say(this.m('printOnlyAfter'), L);
      case 'RESUME':
        return this.startAnswer();
      case 'STOP_ANSWER':
      case 'PAUSE':
        return this.say(this.m('notRecording'), L);
      case 'UNDO':
        return this.undo(s.current, L);
      case 'CONFIRM':
      case 'TRY_AGAIN':
      case 'CONTINUE':
        return this.say(this.m('answerSavedShort'), L);
      case 'DONE':
        return this.say(this.m('editDone'), L, { edit: null, cursor: null });
      default:
        return this.unknown();
    }
  }

  submittedCommand(cmd) {
    const s = this.state;
    const S = MODE.SUBMITTED;
    switch (cmd.type) {
      case 'READ_ANSWER':
        return this.readAnswer(cmd.n ? cmd.n - 1 : s.current, S, false);
      case 'NEXT':
      case 'NEXT_ITEM':
      case 'PREV':
      case 'PREV_ITEM': {
        const i = s.current + (cmd.type.startsWith('NEXT') ? 1 : -1);
        if (i < 0 || i >= this.count) return this.say(this.m(i < 0 ? 'firstQuestion' : 'lastQuestion').split('.')[0] + '.', S);
        this.set({ current: i });
        return this.say(this.questionOnly(i), S);
      }
      case 'GOTO':
        if (!cmd.n || cmd.n < 1 || cmd.n > this.count) return this.say(this.m('noSuchQuestion', this.count), S);
        this.set({ current: cmd.n - 1 });
        return this.say(this.questionOnly(cmd.n - 1), S);
      case 'REPEAT_QUESTION':
        return this.say(this.questionOnly(s.current), S);
      case 'READ_OPTIONS':
      case 'READ_OPTION':
      case 'NEXT_OPTION':
      case 'PREV_OPTION':
      case 'MY_CHOICE':
        if (this.isMcq()) return this.choiceCommand(cmd, S);
        return this.say(this.m('locked'), S);
      case 'READ_SENTENCE':
        return this.readSentence(cmd.n, S);
      case 'READ_PARAGRAPH':
        return this.readParagraph(cmd.n, S);
      case 'PRINT':
        return this.print('answers');
      case 'PRINT_LOG':
        return this.print('log');
      case 'HELP':
        return this.say(helpText(s.lang, 'submitted'), S);
      case 'REMAINING': {
        const { answered, unanswered } = this.counts();
        return this.say(this.m('remaining', answered, unanswered.length, unanswered), S);
      }
      default:
        return this.say(this.m('locked'), S);
    }
  }

  // ---------- questions ----------
  questionOnly(i) {
    return [this.m('questionLabel', i + 1), this.qSeg(i)];
  }

  questionText(i, revisit = false) {
    const c0 = this.state.choices[i];
    if (revisit && this.isMcq(i) && c0 && c0.sel !== null && c0.sel !== undefined) {
      // Back on an answered question: where things stand, not the whole routine again.
      return [this.m('questionLabel', i + 1), this.m('revisitChoice', letterOf(c0.sel), this.optionTexts(i)[c0.sel], c0.locked), this.hint('revisitHint', null)];
    }
    if (revisit && !this.isMcq(i) && getSentences(this.state.answers[i]).length) {
      return [this.m('questionLabel', i + 1), this.m('revisitWritten', getSentences(this.state.answers[i]).length), this.hint('revisitHint', null)];
    }
    if (revisit && this.isMcq(i)) return [this.questionOnly(i), this.m('mcqIntroShort', this.optionTexts(i).length)];
    if (this.isMcq(i)) {
      const c = this.state.choices[i];
      const state = c && c.sel !== null && c.sel !== undefined ? ` ${this.m('choiceState', letterOf(c.sel), c.locked)}` : '';
      return [this.questionOnly(i), state, this.hint('mcqIntro', 'mcqIntroShort', this.optionTexts(i).length)];
    }
    const k = getSentences(this.state.answers[i]).length;
    const tail = k ? this.hint('hasAnswer', 'hasAnswerShort', k) : this.hint('speakNow', null);
    return [this.questionOnly(i), tail];
  }

  startExam() {
    this.log('exam_started', {}, null);
    const mins = totalMinutes(this.state.setup);
    this.warned = new Set();
    this.set({ started: true, current: 0, timerEndsAt: mins > 0 ? Date.now() + mins * 60000 : null, optionCursor: null, recordOff: false });
    this.visit(0);
    const timeNote = mins > 0 ? this.m('timeLeft', mins * 60) : '';
    this.say([this.m('examIntro', this.count), timeNote, this.hint('howToTalk', null), this.questionText(0)], this.home());
  }

  goto(i) {
    this.log('navigated', { to: i + 1 });
    this.inEditor = false;
    const revisit = !!this.state.visited[i];
    this.set({ current: i, edit: null, cursor: null, optionCursor: null, recordOff: false, dictTarget: null });
    this.visit(i);
    this.say(this.questionText(i, revisit), this.home());
  }

  counts() {
    const unanswered = [];
    const picks = [];
    const reviews = [];
    for (let i = 0; i < this.count; i++) {
      const st = this.status(i);
      if (st !== 'answered' && st !== 'picked') unanswered.push(i + 1);
      if (st === 'picked') picks.push(i + 1);
      if (this.state.review[i]) reviews.push(i + 1);
    }
    return { answered: this.count - unanswered.length, unanswered, picks, reviews };
  }

  readAnswer(i, next, withHint) {
    if (i < 0 || i >= this.count) return this.say(this.m('noSuchQuestion', this.count), next);
    if (this.isMcq(i)) {
      const c = this.state.choices[i];
      if (!c || c.sel === null || c.sel === undefined) return this.say(`${this.m('questionLabel', i + 1)} ${this.m('nothingPicked')}`, next);
      return this.say(`${this.m('questionLabel', i + 1)} ${this.m('myChoice', letterOf(c.sel), this.optionTexts(i)[c.sel], c.locked)}`, next);
    }
    const paras = paragraphs(this.state.answers[i]);
    const total = paras.reduce((n, p) => n + p.length, 0);
    if (!total) return this.say(this.m('answerEmpty', i + 1), next);
    const parts = [this.m('readAnswerHeader', i + 1, total)];
    paras.forEach((p, pi) => {
      if (paras.length > 1) parts.push(this.m('paragraphLabel', pi + 1));
      p.forEach(({ n, text }) => parts.push(`${this.m('sentenceLabel', n)} ${text}`));
    });
    if (withHint && i === this.state.current) {
      const h = this.hint('readAnswerEnd', null);
      if (h) parts.push(h);
    }
    this.log('answer_read', { answer: i + 1 }, i);
    this.say(parts.join(' '), next);
  }

  readSentence(n, next) {
    const sents = getSentences(this.state.answers[this.state.current]);
    const k = this.resolveN(n, sents.length);
    if (!k || k < 1 || k > sents.length) return this.say(this.m('noSuchSentence', n === -1 ? 0 : n, sents.length), next);
    this.say(`${this.m('sentenceLabel', k)} ${sents[k - 1]}`, next);
  }

  readParagraph(n, next) {
    const paras = paragraphs(this.state.answers[this.state.current]);
    const k = this.resolveN(n, paras.length);
    if (!k || k < 1 || k > paras.length) return this.say(this.m('noSuchParagraph', n === -1 ? 0 : n, paras.length), next);
    const parts = [this.m('paragraphLabel', k)];
    paras[k - 1].forEach(({ n: sn, text }) => parts.push(`${this.m('sentenceLabel', sn)} ${text}`));
    this.say(parts.join(' '), next);
  }

  /**
   * Integrity record for one question, from the activity log: how the answer was produced.
   * Printed on the answer sheet so an evaluator can see it was dictated and reviewed by the student.
   */
  integrity(i) {
    const ev = this.state.log.filter((e) => e.q === i + 1);
    const count = (...types) => ev.filter((e) => types.includes(e.type)).length;
    const times = ev.map((e) => e.ts).sort();
    return {
      dictated: count('dictation_chunk', 'restored_command_phrase'),
      edits: ev.filter((e) => e.type.startsWith('edit_') && e.type !== 'edit_proposed' && e.type !== 'edit_cancelled').length + count('undo', 'chunk_removed'),
      reads: count('answer_read'),
      picks: count('option_picked'),
      locks: count('option_locked'),
      first: times[0] || null,
      last: times[times.length - 1] || null,
    };
  }

  // ---------- multiple choice ----------
  /** Best option for spoken words ("mercury", "carbon dioxide"); null when nothing is close. */
  /**
   * The option whose words were spoken ("mercury", "carbon dioxide", "100 degrees Celsius").
   * The whole spoken phrase must closely match one whole option: "read all option" must never pick
   * "Earth". Returns null when no option is clearly meant.
   */
  matchOption(words, i = this.state.current) {
    const lists = [this.optionTexts(i), this.optionTexts(i, 'en-IN')];
    const want = normalize(words);
    if (!want) return null;
    const scores = [];
    lists.forEach((list) =>
      list.forEach((o, k) => {
        const n = normalize(o);
        const sc = n === want ? 1 : similarity(n, want);
        scores.push({ k, score: sc });
      }),
    );
    scores.sort((a, b) => b.score - a.score);
    if (scores[0]?.score === 1) return scores[0];
    // Options that differ only by a number ("100 degrees" / "200 degrees"): the number decides.
    const nums = (x) => (normalize(x).match(/\d+(?:\.\d+)?/g) || []).join(' ');
    const spokenNums = nums(words);
    if (spokenNums) {
      const byNum = [...new Set(lists.flatMap((list) => list.map((o, k) => (nums(o) === spokenNums ? k : -1)).filter((k) => k >= 0)))];
      if (byNum.length === 1) {
        const hit = scores.find((x) => x.k === byNum[0]);
        if (hit && hit.score >= 0.6) return hit;
      }
    }
    const best = scores[0];
    const second = scores.find((x) => x.k !== best?.k);
    if (!best || best.score < 0.75) return null;
    if (second && best.score - second.score < 0.1) return null; // too close to call
    return best;
  }

  /**
   * Understand an utterance that is not answer text: exact commands, then (on a multiple-choice
   * question) a choice or an option named in a sentence, then instructions in the student's own
   * words, and only last an option's own words.
   */
  understand(text, alts) {
    const s = this.state;
    const lang = s.lang;
    const mcq = s.started && !s.submitted && this.isMcq();
    const first = (fn) => alts.map(fn).find(Boolean) || null;
    let cmd = parseCommandAlternatives(alts, lang, { strict: true });
    if (cmd && !(mcq && cmd.type === 'REPLACE_WITH')) return cmd;
    if (mcq) {
      cmd = first((a) => parseLockIntent(a)) || first((a) => parseChoiceText(a, lang)) || first((a) => parseOptionMention(a));
      if (cmd) return cmd;
    }
    cmd = first((a) => parseInstruction(a, lang));
    if (cmd) return cmd;
    if (mcq && normalize(text).split(' ').length <= 6 && this.matchOption(text)) return { type: 'SELECT_OPTION', text };
    return null;
  }

  /** Returns true when the command was handled for the current multiple-choice question. */
  choiceCommand(cmd, next) {
    const s = this.state;
    const i = s.current;
    const opts = this.optionTexts(i);
    const c = s.choices[i] || { sel: null, locked: false };
    const has = c.sel !== null && c.sel !== undefined;
    const last = letterOf(opts.length - 1);
    const setChoice = (patch, event, extra = {}) => {
      const val = { ...c, ...patch };
      this.set({ choices: s.choices.map((x, k) => (k === i ? (val.sel === null ? null : val) : x)) });
      this.log(event, { option: val.sel !== null ? letterOf(val.sel) : null, text: val.sel !== null ? opts[val.sel] : null, ...extra }, i);
    };
    const resolve = () => {
      if (cmd.text) {
        const hit = this.matchOption(cmd.text, i);
        if (!hit) {
          this.say(this.m('optionNotFound', cmd.text), next);
          return null;
        }
        return hit.k;
      }
      const k = (cmd.n === -1 ? opts.length : cmd.n) - 1;
      if (k < 0 || k >= opts.length) {
        this.say(this.m('noSuchOption', letterOf(Math.max(k, 0)), last), next);
        return null;
      }
      return k;
    };
    const readOne = (k) => {
      this.set({ optionCursor: k });
      this.log('option_read', { option: letterOf(k) }, i);
      const hint = k < opts.length - 1 ? this.hint('optionNextHint', null, letterOf(k)) : this.m('lastOption');
      this.say(`${this.m('optionLine', letterOf(k), opts[k])} ${hint}`.trim(), next);
    };
    if (s.submitted && !['READ_OPTIONS', 'READ_OPTION', 'NEXT_OPTION', 'PREV_OPTION', 'MY_CHOICE'].includes(cmd.type)) return false;
    switch (cmd.type) {
      case 'READ_OPTIONS': {
        this.set({ optionCursor: null });
        this.log('options_read', {}, i);
        const lines = opts.map((o, k) => this.m('optionLine', letterOf(k), o)).join(' ');
        const tail = s.submitted ? '' : has ? this.m('choiceState', letterOf(c.sel), c.locked) : this.hint('optionsHint', null);
        this.say(`${lines} ${tail}`.trim(), next);
        return true;
      }
      case 'READ_OPTION': {
        const k = resolve();
        if (k !== null) readOne(k);
        return true;
      }
      case 'NEXT_OPTION':
      case 'NEXT_ITEM':
        if (cmd.type === 'NEXT_ITEM' && s.optionCursor === null) return false; // plain "next" = next question
        if (s.optionCursor !== null && s.optionCursor >= opts.length - 1) this.say(this.m('lastOption'), next);
        else readOne(s.optionCursor === null ? 0 : s.optionCursor + 1);
        return true;
      case 'PREV_OPTION':
      case 'PREV_ITEM':
        if (cmd.type === 'PREV_ITEM' && s.optionCursor === null) return false;
        if (!s.optionCursor) this.say(this.m('firstOption'), next);
        else readOne(s.optionCursor - 1);
        return true;
      case 'MY_CHOICE':
      case 'READ_ANSWER':
        if (cmd.type === 'READ_ANSWER' && cmd.n && cmd.n - 1 !== i) return false;
        this.say(has ? this.m('myChoice', letterOf(c.sel), opts[c.sel], c.locked) : this.m('nothingPicked'), next);
        return true;
      case 'SELECT_OPTION': {
        const k = resolve();
        if (k === null) return true;
        if (c.locked && k === c.sel) {
          this.say(this.m('myChoice', letterOf(k), opts[k], true), next);
          return true;
        }
        // Changing your mind is always allowed. A new pick is not locked until the student says so.
        const changed = has && c.sel !== k;
        setChoice({ sel: k, locked: false }, changed ? 'option_changed' : 'option_picked', changed ? { previous: letterOf(c.sel) } : {});
        this.earcon('listen');
        const text = changed ? this.m('changedPick', letterOf(c.sel), letterOf(k), opts[k]) : this.hint('selected', 'selectedShort', letterOf(k), opts[k]);
        this.say(text, next, { optionCursor: k });
        return true;
      }
      case 'LOCK_CHOICE':
      case 'CONFIRM': {
        let k = has ? c.sel : null;
        if (cmd.n) {
          k = resolve();
          if (k === null) return true;
        }
        if (k === null) {
          if (cmd.type === 'CONFIRM') return false;
          this.say(this.m('nothingPicked'), next);
          return true;
        }
        if (!c.locked || k !== c.sel) setChoice({ sel: k, locked: true }, 'option_locked', has && c.sel !== k ? { previous: letterOf(c.sel) } : {});
        this.earcon('saved');
        this.say(this.m('lockedChoice', letterOf(k), opts[k]), next, { optionCursor: null });
        return true;
      }
      case 'UNLOCK_CHOICE':
      case 'EDIT_ANSWER':
        if (cmd.type === 'EDIT_ANSWER' && cmd.n && cmd.n - 1 !== i) return false;
        if (!c.locked) {
          this.say(has ? `${this.m('myChoice', letterOf(c.sel), opts[c.sel], false)} ${this.hint('optionsHint', null)}`.trim() : this.m('nothingPicked'), next);
          return true;
        }
        setChoice({ locked: false }, 'option_unlocked');
        this.say(this.m('unlocked', letterOf(c.sel)), next);
        return true;
      case 'CLEAR_CHOICE':
      case 'CLEAR_ANSWER':
        if (!has) {
          this.say(this.m('nothingPicked'), next);
          return true;
        }
        setChoice({ sel: null, locked: false }, 'option_cleared');
        this.say(this.m('choiceCleared'), next, { optionCursor: null });
        return true;
      case 'START_ANSWER':
      case 'ANSWER_QUESTION':
        if (cmd.type === 'ANSWER_QUESTION' && cmd.n && cmd.n - 1 !== i) return false;
        this.say(this.m('isMcq'), next);
        return true;
      case 'HELP':
        this.say(helpText(s.lang, 'mcq'), next);
        return true;
      default:
        if (EDIT_TYPES.has(cmd.type)) {
          this.say(this.m('isMcq'), next);
          return true;
        }
        return false;
    }
  }

  markReview(on, next) {
    const s = this.state;
    const i = s.current;
    this.set({ review: s.review.map((v, k) => (k === i ? on : v)) });
    this.log(on ? 'marked_for_review' : 'review_mark_removed', {}, i);
    this.say(this.m(on ? 'markedReview' : 'unmarkedReview', i + 1), next);
  }

  /** "Let me think": no reminders and no prompts until the student speaks again. */
  giveTime(mode) {
    this.clearSilence();
    this.log('thinking_time', {});
    const s = this.state;
    const text = this.hint('thinking', 'thinkingShort');
    this.say(mode === MODE.CONFIRMING && s.confirm ? `${text} ${s.confirm.prompt}` : text, mode, { thinking: true });
  }

  // ---------- editing ----------
  openEdit() {
    const s = this.state;
    if (s.submitted) return this.say(this.m('locked'), MODE.SUBMITTED);
    const k = getSentences(s.answers[s.current]).length;
    if (!k) return this.say(this.m('answerEmpty', s.current + 1), MODE.LISTENING_FOR_COMMAND);
    this.inEditor = true;
    this.set({ edit: { q: s.current }, cursor: 0 });
    // One short question. Nothing to memorise: the student says what to change in their own words.
    this.say([this.hint('editStart', 'editStartShort', s.current + 1, k), this.m('editAsk')], MODE.EDIT_COMMAND, { cursor: 0, edit: { q: s.current } });
  }

  /** Read the sentence under the edit cursor (with the command hint the first few times). */
  readCursor(prefix = '', next = MODE.EDIT_COMMAND, suffix = '') {
    const s = this.state;
    const sents = getSentences(s.answers[s.current]);
    if (!sents.length) return this.say(`${prefix} ${this.m('answerEmpty', s.current + 1)}`.trim(), MODE.LISTENING_FOR_COMMAND, { cursor: null, edit: null });
    const i = Math.min(Math.max(s.cursor ?? 0, 0), sents.length - 1);
    this.say(`${prefix} ${this.m('sentenceAt', i + 1, sents.length, sents[i])} ${suffix}`.replace(/\s+/g, ' ').trim(), next, { cursor: i, edit: { q: s.current } });
  }

  beginWordChange(si, start, len) {
    const s = this.state;
    const sents = getSentences(s.answers[s.current]);
    const old = wordsOf(sents[si]).slice(start, start + len).join(' ');
    this.say(this.m('wordPrompt', start + 1, old, si + 1), MODE.DICTATING, {
      cursor: si,
      dictTarget: { kind: 'word', sentence: si, start, len },
      edit: { q: s.current, op: 'sentence', index: si, word: { start, len } },
      confirm: null,
      paused: false,
    });
  }

  /** Ask to confirm a whole new version of one sentence. */
  proposeSentence(si, proposed, lead = '') {
    const q = this.state.current;
    const prompt = `${lead ? lead + ' ' : ''}${this.m('confirmSentence', si + 1, proposed)}`;
    this.say(prompt, MODE.CONFIRMING, { cursor: si, confirm: { kind: 'edit', prompt }, edit: { q, op: 'sentence', index: si, proposed } });
  }

  /** Where in the current answer the student's spoken words are (fuzzy: "bio gas" finds "biogas"). */
  findSpoken(words) {
    const sents = getSentences(this.state.answers[this.state.current]);
    let hit = null;
    const tries = [words, String(words).replace(/\s+/g, '')];
    sents.forEach((sen, si) =>
      tries.forEach((w) => {
        const h = findWords(sen, w, 0.72);
        if (h && (!hit || h.score > hit.score)) hit = { si, ...h };
      }),
    );
    return hit;
  }

  /** Returns true when handled as an edit command. */
  editCommand(cmd) {
    const s = this.state;
    const q = s.current;
    const sents = getSentences(s.answers[q]);
    const E = MODE.EDIT_COMMAND;
    const k = sents.length;
    const cur = Math.min(Math.max(s.cursor ?? 0, 0), Math.max(k - 1, 0));
    const needSentences = () => {
      if (k) return false;
      this.say(this.m('answerEmpty', q + 1), MODE.LISTENING_FOR_COMMAND, { edit: null, cursor: null });
      return true;
    };
    const moveTo = (i) => {
      this.set({ cursor: i });
      this.readCursor();
    };
    switch (cmd.type) {
      case 'NEXT_ITEM':
      case 'NEXT_SENTENCE':
        if (needSentences()) return true;
        if (cur >= k - 1) this.say(this.m('lastSentenceReached', k), E, { cursor: cur });
        else moveTo(cur + 1);
        return true;
      case 'PREV_ITEM':
      case 'PREV_SENTENCE':
        if (needSentences()) return true;
        if (cur <= 0) this.say(this.m('firstSentenceReached'), E, { cursor: 0 });
        else moveTo(cur - 1);
        return true;
      case 'NEXT_PARAGRAPH':
      case 'PREV_PARAGRAPH': {
        if (needSentences()) return true;
        const paras = paragraphs(s.answers[q]);
        const pi = paras.findIndex((p) => p.some((x) => x.n === cur + 1));
        const target = paras[cmd.type === 'NEXT_PARAGRAPH' ? pi + 1 : pi - 1];
        if (!target) this.say(this.m('noMoreParagraphs', paras.length), E);
        else {
          this.set({ cursor: target[0].n - 1 });
          this.readCursor(this.m('paragraphLabel', paras.indexOf(target) + 1));
        }
        return true;
      }
      case 'GOTO_SENTENCE':
      case 'READ_SENTENCE': {
        if (needSentences()) return true;
        const n = this.resolveN(cmd.n, k);
        if (!n || n < 1 || n > k) this.say(this.m('noSuchSentence', cmd.n === -1 ? 0 : cmd.n, k), E);
        else moveTo(n - 1);
        return true;
      }
      case 'READ_THIS':
        if (needSentences()) return true;
        moveTo(cur);
        return true;
      case 'READ_WORDS': {
        if (needSentences()) return true;
        const list = wordsOf(sents[cur]).map((w, i) => `${i + 1}, ${w}`).join('. ');
        this.say(`${this.m('wordsList', cur + 1, list)} ${this.hint('wordsHint', null)}`.trim(), E, { cursor: cur });
        return true;
      }
      case 'CHANGE_WORD':
      case 'DELETE_WORD': {
        if (needSentences()) return true;
        const words = wordsOf(sents[cur]);
        const wi = this.resolveN(cmd.n, words.length) - 1;
        if (wi < 0 || wi >= words.length) {
          this.say(this.m('noSuchWord', cmd.n === -1 ? 0 : cmd.n, words.length, cur + 1), E);
          return true;
        }
        if (cmd.type === 'CHANGE_WORD') this.beginWordChange(cur, wi, 1);
        else this.proposeSentence(cur, replaceWordsAt(sents[cur], wi, 1, ''), this.m('deleteWordLead', wi + 1, words[wi]));
        return true;
      }
      case 'REMOVE_WORDS': {
        if (needSentences()) return true;
        const hit = this.findSpoken(cmd.words);
        if (!hit) {
          this.say(this.m('wordNotFound', cmd.words, q + 1), this.inEditor ? E : this.home());
          return true;
        }
        const proposed = replaceWordsAt(sents[hit.si], hit.start, hit.len, '').replace(/\s{2,}/g, ' ').trim();
        this.say('', MODE.CONFIRMING, { confirm: { kind: 'edit', prompt: '' }, edit: { q, op: 'sentence', index: hit.si, proposed } });
        return true;
      }
      case 'FIX_WORD': {
        if (needSentences()) return true;
        // Look in the current sentence first, then in the whole answer.
        let hit = null;
        const here = findWords(sents[cur], cmd.word);
        if (here) hit = { si: cur, ...here };
        if (!hit || hit.score < 0.8) {
          sents.forEach((sen, si) => {
            const h = findWords(sen, cmd.word);
            if (h && (!hit || h.score > hit.score + 0.1)) hit = { si, ...h };
          });
        }
        if (!hit) this.say(this.m('fixNotFound', cmd.word, cur + 1), E);
        else this.beginWordChange(hit.si, hit.start, hit.len);
        return true;
      }
      case 'DELETE_THIS':
        if (needSentences()) return true;
        cmd = { type: 'DELETE_SENTENCE', n: cur + 1 };
        break;
      case 'REWRITE_THIS':
        if (needSentences()) return true;
        this.beginReplace(cur);
        return true;
      case 'ADD_AFTER_THIS':
        if (!k) this.beginAdd();
        else this.beginInsert(cur + 1);
        return true;
      case 'REPLACE_WITH': {
        if (needSentences()) return true;
        const n = cmd.n === null || cmd.n === undefined ? cur + 1 : this.resolveN(cmd.n, k);
        if (!n || n < 1 || n > k) {
          this.say(this.m('noSuchSentence', cmd.n === -1 ? 0 : cmd.n, k), E);
          return true;
        }
        const prompt = this.m('confirmReplace', n, cmd.text);
        this.say(prompt, MODE.CONFIRMING, { cursor: n - 1, confirm: { kind: 'edit', prompt }, edit: { q, op: 'replace', index: n - 1, proposed: cmd.text } });
        return true;
      }
      case 'ADD_AFTER_TEXT': {
        if (needSentences()) return true;
        let found = null;
        if (cmd.anchor) {
          sents.forEach((sen, si) => {
            const h = findPhrase(sen, cmd.anchor);
            if (h && (!found || h.score > found.score)) found = { si, ...h, text: cmd.text };
          });
          if (!found) {
            const h = this.findSpoken(cmd.anchor);
            if (h) found = { ...h, text: cmd.text };
          }
        } else {
          // "add after photosynthesis plants need light": the longest start that matches the answer is the anchor.
          const w = cmd.rest.split(/\s+/);
          for (let a = Math.min(w.length - 1, 5); a >= 1 && !found; a--) {
            sents.forEach((sen, si) => {
              const h = findPhrase(sen, w.slice(0, a).join(' '));
              if (h && (!found || h.score > found.score)) found = { si, ...h, text: w.slice(a).join(' ') };
            });
          }
        }
        if (!found || !found.text) this.say(this.m('anchorNotFound', cmd.anchor || cmd.rest.split(/\s+/)[0]), E);
        else this.proposeSentence(found.si, insertAfterWords(sents[found.si], found.start, found.len, found.text));
        return true;
      }
      default:
    }
    switch (cmd.type) {
      case 'READ_PARAGRAPH':
        this.readParagraph(cmd.n, E);
        return true;
      case 'READ_PARAGRAPH':
        this.readParagraph(cmd.n, E);
        return true;
      case 'INSERT_AFTER':
      case 'INSERT_BEFORE': {
        const k = this.resolveN(cmd.n, sents.length);
        if (!sents.length) {
          this.beginAdd();
          return true;
        }
        if (!k || k < 1 || k > sents.length) {
          this.say(this.m('noSuchSentence', cmd.n === -1 ? 0 : cmd.n, sents.length), E);
          return true;
        }
        this.beginInsert(cmd.type === 'INSERT_AFTER' ? k : k - 1, cmd.type === 'INSERT_BEFORE');
        return true;
      }
      case 'REPLACE_WORD': {
        const r = replaceWord(s.answers[q], cmd.from, cmd.to);
        if (r) {
          const prompt = this.m('confirmWord', cmd.from, cmd.to, r.index + 1, r.newSentence, r.count);
          this.say(prompt, MODE.CONFIRMING, {
            confirm: { kind: 'edit', prompt },
            edit: { q, op: 'word', index: r.index, proposed: r.newSentence, newChunks: r.chunks, from: cmd.from, to: cmd.to },
          });
          return true;
        }
        // Not found as written: the recogniser may spell or split it differently ("bio gas" / "biogas").
        const hit = this.findSpoken(cmd.from);
        if (!hit) {
          this.say(this.m('wordNotFound', cmd.from, q + 1), sents.length && this.inEditor ? E : this.home());
          return true;
        }
        const proposed = replaceWordsAt(sents[hit.si], hit.start, hit.len, cmd.to);
        this.say('', MODE.CONFIRMING, { confirm: { kind: 'edit', prompt: '' }, edit: { q, op: 'sentence', index: hit.si, proposed, from: cmd.from, to: cmd.to } });
        return true;
      }
      case 'CLEAR_ANSWER': {
        if (!sents.length) {
          this.say(this.m('answerEmpty', q + 1), MODE.LISTENING_FOR_COMMAND);
          return true;
        }
        const prompt = this.m('confirmClear', q + 1);
        this.say(prompt, MODE.CONFIRMING, { confirm: { kind: 'edit', prompt }, edit: { q, op: 'clear' } });
        return true;
      }
      case 'REPLACE_SENTENCE':
      case 'DELETE_SENTENCE': {
        const idx = this.resolveN(cmd.n || 0, sents.length) - 1;
        if (idx < 0 || idx >= sents.length) {
          this.say(this.m('noSuchSentence', cmd.n === -1 ? 0 : cmd.n, sents.length), sents.length ? E : MODE.LISTENING_FOR_COMMAND);
          return true;
        }
        if (cmd.type === 'REPLACE_SENTENCE') this.beginReplace(idx);
        else {
          const prompt = this.m('confirmDelete', idx + 1, sents[idx]);
          this.say(prompt, MODE.CONFIRMING, { cursor: idx, confirm: { kind: 'edit', prompt }, edit: { q, op: 'delete', index: idx } });
        }
        return true;
      }
      case 'ADD_TO_ANSWER':
        this.beginAdd();
        return true;
      case 'UNDO':
        this.undo(q, this.effectiveMode() === E ? E : this.home());
        return true;
      case 'DONE':
        this.inEditor = false;
        this.set({ edit: null, cursor: null });
        this.say(this.m('editDone'), this.home(), { edit: null, cursor: null });
        return true;
      case 'EDIT_ANSWER':
        if (cmd.n && cmd.n - 1 !== q) return false;
        this.openEdit();
        return true;
      case 'READ_ANSWER':
        if (cmd.n && cmd.n - 1 !== q) return false;
        this.readAnswer(q, E, false);
        return true;
      case 'THAT_WAS_MY_ANSWER':
        this.restoreCached();
        return true;
      case 'HELP':
        this.say(helpText(s.lang, 'edit'), E);
        return true;
      case 'START_ANSWER':
        this.set({ edit: null });
        this.startAnswer();
        return true;
      default:
        return false;
    }
  }

  beginReplace(idx) {
    const s = this.state;
    const sents = getSentences(s.answers[s.current]);
    this.say(this.m('replacePrompt', idx + 1, sents[idx]), MODE.DICTATING, {
      cursor: idx,
      dictTarget: { kind: 'replace', index: idx },
      edit: { q: s.current, op: 'replace', index: idx },
      confirm: null,
      paused: false,
    });
  }

  beginAdd() {
    const s = this.state;
    this.say(this.m('addPrompt'), MODE.DICTATING, {
      dictTarget: { kind: 'add' },
      edit: { q: s.current, op: 'add' },
      confirm: null,
      paused: false,
    });
  }

  /** New sentence will become number position+1 (0-based position). */
  beginInsert(position, before = false) {
    const s = this.state;
    const sents = getSentences(s.answers[s.current]);
    const ref = before ? position + 1 : position; // 1-based sentence the student referred to
    this.say(this.m('insertPrompt', ref, before, sents[ref - 1] || ''), MODE.DICTATING, {
      dictTarget: { kind: 'insert', index: position },
      edit: { q: s.current, op: 'insert', index: position, before },
      confirm: null,
      paused: false,
    });
  }

  applyEdit() {
    const s = this.state;
    const { q, op, index, proposed } = s.edit;
    const chunks = s.answers[q];
    const before = getSentences(chunks);
    let after;
    if (op === 'replace') after = replaceSentence(chunks, index, proposed);
    else if (op === 'delete') after = deleteSentence(chunks, index);
    else if (op === 'add') after = [...chunks, proposed];
    else if (op === 'insert') after = insertSentence(chunks, index, proposed);
    else if (op === 'word') after = s.edit.newChunks;
    else if (op === 'sentence') after = replaceSentence(chunks, index, proposed);
    else if (op === 'clear') after = [];
    else after = chunks;
    const history = s.history.map((h, i) => (i === q ? [...h, chunks] : h));
    const answers = s.answers.map((a, i) => (i === q ? after : a));
    this.set({ answers, history });
    this.log(`edit_${op}`, {
      sentence: op === 'add' ? getSentences(after).length : op === 'clear' ? null : index + 1,
      before: op === 'add' || op === 'insert' ? null : op === 'clear' ? before.join(' ') : before[index],
      after: op === 'delete' || op === 'clear' ? null : proposed,
      ...(op === 'word' ? { from: s.edit.from, to: s.edit.to } : {}),
    }, q);
    this.earcon('saved');
    const total = getSentences(after).length;
    const cursor = op === 'add' ? total - 1 : op === 'clear' ? null : Math.min(index ?? 0, Math.max(total - 1, 0));
    const what =
      op === 'delete' ? this.m('deletedSentence', index + 1, before[index] || '')
        : op === 'add' ? this.m('addedText', proposed)
          : op === 'clear' ? this.m('answerCleared', q + 1)
            : this.m('sentenceNow', index + 1, getSentences(after)[index] || proposed);
    this.lastAction = 'edit';
    const stay = total && this.inEditor;
    if (!total) this.inEditor = false;
    this.set({ confirm: null, dictTarget: null, edit: stay ? { q } : null, cursor: stay ? cursor : null });
    this.say([what, this.hint('undoHint', null)], stay ? MODE.EDIT_COMMAND : this.home());
  }

  undo(q, next) {
    const s = this.state;
    const stack = s.history[q];
    if (!stack.length) return this.say(this.m('nothingToUndo'), next);
    const prev = stack[stack.length - 1];
    const history = s.history.map((h, i) => (i === q ? h.slice(0, -1) : h));
    const answers = s.answers.map((a, i) => (i === q ? prev : a));
    this.log('undo', { before: getSentences(s.answers[q]).join(' '), after: getSentences(prev).join(' ') }, q);
    this.set({ answers, history });
    this.say(this.m('undone', q + 1), next, { edit: next === MODE.EDIT_COMMAND ? { q } : null });
  }

  // ---------- submission ----------
  requestSubmit(prefix = '') {
    const { answered, unanswered, picks, reviews } = this.counts();
    const summary = `${this.m('submitSummary', answered, unanswered.length, unanswered, this.count)}${this.m('submitExtra', picks, reviews)}`;
    const prompt = `${prefix ? prefix + ' ' : ''}${summary} ${this.m('submitAsk')}`;
    this.log('submit_requested', { answered, unanswered: unanswered.length }, null);
    this.say(prompt, MODE.CONFIRMING, { confirm: { kind: 'submit', prompt }, edit: null });
  }

  doSubmit() {
    const { answered } = this.counts();
    const submittedAt = new Date().toISOString();
    this.set({ submitted: true, submittedAt, confirm: null, edit: null, pending: null });
    this.log('exam_submitted', { answered }, null);
    this.say(this.m('submitted'), MODE.SUBMITTED);
  }

  print(target) {
    this.log('print_requested', { target }, null);
    this.say(this.m('printing'), MODE.SUBMITTED, { printTarget: target });
    // Open the dialog once the explanation has been spoken.
    const after = this.lastPrompt;
    const wait = () => {
      if (this.state.mode === MODE.SPEAKING && this.lastPrompt === after) return setTimeout(wait, 200);
      this.io.stopListening();
      setTimeout(() => {
        window.print();
        this.set({ printTarget: null });
        this.enter(MODE.SUBMITTED);
      }, 50);
    };
    setTimeout(wait, 200);
  }

  /** Print triggered directly by a button (keyboard user, no speech wait). */
  printNow(target) {
    this.io.cancel();
    this.io.stopListening();
    this.log('print_requested', { target }, null);
    this.set({ printTarget: target });
    setTimeout(() => {
      window.print();
      this.set({ printTarget: null });
      if (this.state.booted) this.enter(MODE.SUBMITTED);
    }, 50);
  }

  // ---------- settings ----------
  updateSettings(patch) {
    const settings = { ...this.state.settings, ...patch };
    this.io.rate = settings.rate;
    this.io.voiceEnabled = settings.voice;
    if (this.io.processLocally !== !!settings.onDevice) {
      this.io.processLocally = !!settings.onDevice;
      this.io.restart?.(); // apply on the next recognition session
    }
    this.set({ settings });
  }

  toggleLowConf() {
    this.set({ simulateLowConf: !this.state.simulateLowConf });
  }

  reset() {
    this.io.cancel();
    this.io.stopListening();
    this.clearSilence();
    clearSaved();
    this.beginning = false;
    this.hintCounts = {};
    const { settings, setup } = this.state;
    this.lastPrompt = null;
    this.warned = new Set();
    this.set({
      ...freshPersisted(setup.questions?.length || QUESTION_COUNT),
      settings,
      setup,
      hasSaved: false,
      booted: false,
      mode: MODE.IDLE,
      nextMode: null,
      paused: false,
      dictTarget: null,
      confirm: null,
      edit: null,
      prompt: '',
      lastHeard: '',
      interim: '',
      failures: 0,
      micProblem: null,
      voiceWarning: null,
      optionCursor: null,
      thinking: false,
    });
  }

  /**
   * Teacher / parent setup: a custom question list (homework, class test) and an optional
   * time limit. Changing the questions clears the current answers.
   */
  applySetup({ title, questions, durationMin, extraTime = true, lang = null }) {
    // Questions are strings (written answers) or {text, type, options, marks} from a typed or uploaded paper.
    const list = (questions || [])
      .map((q) => (typeof q === 'string' ? { text: q.trim(), type: 'text' } : { ...q, text: String(q.text || '').trim() }))
      .filter((q) => q.text)
      .map((q) => {
        const options = (q.options || []).map((o) => String(o).trim()).filter(Boolean);
        const out = { text: q.text, type: options.length >= 2 ? 'mcq' : 'text' };
        if (options.length >= 2) out.options = options;
        if (q.marks) out.marks = Number(q.marks) || undefined;
        return out;
      });
    const setup = {
      title: (title || '').trim() || (list.length ? 'Practice test' : DEFAULT_SETUP.title),
      questions: list.length ? list : null,
      durationMin: Math.max(0, Math.min(300, Number(durationMin) || 0)),
      extraTime: !!extraTime,
      lang: lang || null,
    };
    const sameQuestions = JSON.stringify(setup.questions) === JSON.stringify(this.state.setup.questions);
    this.set({ setup });
    if (!sameQuestions) this.reset();
    this.log('setup_changed', { title: setup.title, questions: this.count, minutes: setup.durationMin || null }, null);
  }
}
