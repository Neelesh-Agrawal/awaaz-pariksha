// How students actually talk. Each phrase is checked in the situation where it would be said,
// against what the app should understand. Add a line here whenever a real user is misunderstood.
import { describe, it, expect, beforeEach, vi } from 'vitest';

class FakeRecognition {
  static last = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  abort() {}
  stop() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.window = globalThis;
  globalThis.webkitSpeechRecognition = FakeRecognition;
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
});

async function engineAt({ lang = 'en-IN', question = 0 }) {
  vi.resetModules();
  const { ExamEngine } = await import('./engine.js');
  const e = new ExamEngine();
  e.set({ booted: true, lang, started: true, current: question, mode: 'LISTENING_FOR_COMMAND' });
  return e;
}

const MCQ = [
  // choosing
  ['B', 'SELECT_OPTION'], ['option B', 'READ_OPTION'], ['choose B', 'SELECT_OPTION'], ['choose option B', 'SELECT_OPTION'],
  ['I want to choose option B', 'SELECT_OPTION'], ['I want B', 'SELECT_OPTION'], ['my answer is B', 'SELECT_OPTION'],
  ['the answer is mercury', 'SELECT_OPTION'], ['mercury', 'SELECT_OPTION'], ['I think it is mercury', 'SELECT_OPTION'],
  ['switch to option C', 'SELECT_OPTION'], ['change it to C', 'SELECT_OPTION'], ['make it D', 'SELECT_OPTION'],
  ['go with B', 'SELECT_OPTION'], ['can you mark option b for me', 'SELECT_OPTION'], ['B is correct', 'SELECT_OPTION'],
  ['option be', 'READ_OPTION'], ['select see', 'SELECT_OPTION'],
  // hearing options
  ['read the options', 'READ_OPTIONS'], ['read all option', 'READ_OPTIONS'], ['what are the options', 'READ_OPTIONS'],
  ['options please', 'READ_OPTIONS'], ['tell me the options again', 'READ_OPTIONS'], ['back to option', 'READ_OPTIONS'],
  ['go back to the options', 'READ_OPTIONS'], ['read option C again', 'READ_OPTION'], ['what is option D', 'READ_OPTION'],
  ['next option', 'NEXT_OPTION'],
  // locking and changing
  ['lock it', 'LOCK_CHOICE'], ['lock B', 'LOCK_CHOICE'], ['final answer', 'LOCK_CHOICE'], ['that is my final answer', 'LOCK_CHOICE'],
  ['lock my option', 'LOCK_CHOICE'], ['block answer', 'LOCK_CHOICE'], ['lock the answer please', 'LOCK_CHOICE'], ['please lock it', 'LOCK_CHOICE'], ['लॉक कर दो', 'LOCK_CHOICE'],
  ['unlock', 'UNLOCK_CHOICE'], ['clear my selection', 'CLEAR_CHOICE'],
  // moving and help
  ['next question', 'NEXT'], ['skip this', 'NEXT'], ['go to question 2', 'GOTO'], ['previous question', 'PREV'],
  ['repeat the question', 'REPEAT_QUESTION'], ['what was the question', 'REPEAT_QUESTION'], ['how much time is left', 'TIME_LEFT'],
  ['help', 'HELP'], ['what can I say', 'HELP'], ['mark for review', 'MARK_REVIEW'], ['let me think', 'THINK'],
];

const AFTER_TAP_WRITTEN = [
  ['stop', 'STOP_ANSWER'], ['stop and research', 'STOP_ANSWER'], ["I'm done", 'STOP_ANSWER'], ['that is all', 'STOP_ANSWER'],
  ['read it back', 'READ_ANSWER'], ['can you read it back to me', 'READ_ANSWER'], ['what did I write', 'READ_ANSWER'],
  ['answer padho', 'READ_ANSWER'], ['change sentence two', 'REPLACE_SENTENCE'], ['I want to change the second line', 'REPLACE_SENTENCE'],
  ['delete the last sentence', 'DELETE_SENTENCE'], ['undo', 'UNDO'], ['take that back', 'UNDO'], ['next question', 'NEXT'],
  ['go to the next one', 'NEXT_ITEM'], ['repeat the question', 'REPEAT_QUESTION'], ['how much time do I have', 'TIME_LEFT'],
  ['edit my answer', 'EDIT_ANSWER'], ['speak slower', 'SLOWER'], ['where am I', 'WHERE_AM_I'], ['submit the paper', 'SUBMIT'],
];

const HINDI = [
  ['बस', 'STOP_ANSWER'], ['बस हो गया', 'STOP_ANSWER'], ['मेरा जवाब पढ़ो', 'READ_ANSWER'], ['जवाब सुनाओ', 'READ_ANSWER'],
  ['अगला सवाल', 'NEXT'], ['सवाल फिर से बोलो', 'REPEAT_QUESTION'], ['कितना टाइम बचा है', 'TIME_LEFT'], ['वाक्य दो बदलो', 'REPLACE_SENTENCE'],
];
const HINDI_MCQ = [['बी चुनो', 'SELECT_OPTION'], ['मेरा जवाब बी है', 'SELECT_OPTION'], ['ऑप्शन पढ़ो', 'READ_OPTIONS'], ['लॉक करो', 'LOCK_CHOICE']];
const TAMIL = [['நிறுத்து', 'STOP_ANSWER'], ['என் பதிலை படி', 'READ_ANSWER'], ['அடுத்த கேள்வி', 'NEXT'], ['நேரம் எவ்வளவு', 'TIME_LEFT']];

describe('real phrasings are understood', () => {
  it.each(MCQ)('multiple choice: "%s" → %s', async (phrase, type) => {
    const e = await engineAt({ question: 5 });
    expect(e.understand(phrase, [phrase])?.type).toBe(type);
  });
  it.each(AFTER_TAP_WRITTEN)('written answer, after a tap: "%s" → %s', async (phrase, type) => {
    const e = await engineAt({ question: 0 });
    expect(e.understand(phrase, [phrase])?.type).toBe(type);
  });
  it.each(HINDI)('Hindi: "%s" → %s', async (phrase, type) => {
    const e = await engineAt({ lang: 'hi-IN', question: 0 });
    expect(e.understand(phrase, [phrase])?.type).toBe(type);
  });
  it.each(HINDI_MCQ)('Hindi multiple choice: "%s" → %s', async (phrase, type) => {
    const e = await engineAt({ lang: 'hi-IN', question: 5 });
    expect(e.understand(phrase, [phrase])?.type).toBe(type);
  });
  it.each(TAMIL)('Tamil: "%s" → %s', async (phrase, type) => {
    const e = await engineAt({ lang: 'ta-IN', question: 0 });
    expect(e.understand(phrase, [phrase])?.type).toBe(type);
  });
  it('answer words on a multiple-choice question are not mistaken for a choice', async () => {
    const e = await engineAt({ question: 5 });
    for (const p of ['banana bread', 'read all option', 'I think so', 'hello']) {
      expect(e.understand(p, [p])?.type).not.toBe('SELECT_OPTION');
    }
  });
});
