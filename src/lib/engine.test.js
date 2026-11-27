// End-to-end flow of the state machine with a fake SpeechRecognition (no synthesis voice,
// so prompts "finish" immediately). Covers the success criteria from the brief.
import { describe, it, expect, beforeEach, vi } from 'vitest';

class FakeRecognition {
  static last = null;
  constructor() {
    FakeRecognition.last = this;
    this.started = false;
  }
  start() {
    if (this.started) throw new Error('already started');
    this.started = true;
    setTimeout(() => this.onstart?.(), 0);
  }
  abort() {
    if (!this.started) return;
    this.started = false;
    setTimeout(() => this.onend?.(), 0);
  }
  stop() {
    this.abort();
  }
  say(text, confidence = 0.9) {
    this.idx = (this.idx || 0) + 1;
    const results = [];
    results[0] = Object.assign([{ transcript: text, confidence }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results, idx: this.idx });
  }
}

let store;
beforeEach(() => {
  vi.useFakeTimers();
  store = {};
  globalThis.window = globalThis;
  globalThis.webkitSpeechRecognition = FakeRecognition;
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => (store[k] = String(v)),
    removeItem: (k) => delete store[k],
  };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  globalThis.print = vi.fn();
});

async function setup() {
  vi.resetModules();
  const { ExamEngine } = await import('./engine.js');
  const e = new ExamEngine();
  // Give each final result a fresh session key so de-duplication does not drop it.
  const rec = FakeRecognition.last;
  const hear = async (text, conf) => {
    await vi.advanceTimersByTimeAsync(1000);
    rec.started = true;
    e.io.session += 1;
    e.io.lastFinal = { text: '', at: 0 };
    rec.say(text, conf);
    await vi.advanceTimersByTimeAsync(1000);
  };
  e.begin();
  await vi.advanceTimersByTimeAsync(500);
  return { e, hear };
}

describe('voice exam flow (v1: just speak; tap or "Awaaz" for instructions)', () => {
  it('a full paper: answers by speaking, instructions after a tap or "Awaaz", multiple choice, submit', async () => {
    const { e, hear } = await setup();
    const tap = async () => {
      e.wake('tap');
      await vi.advanceTimersByTimeAsync(100);
    };
    expect(e.state.prompt).toContain('Choose English, Hindi or Tamil');
    await hear('English');
    expect(e.state.prompt).toBe('English selected. Say Start exam.');

    // Start: the first written question is read and recording starts by itself.
    await hear('Start exam');
    expect(e.state.started).toBe(true);
    expect(e.state.prompt).toContain('Eight questions.');
    expect(e.state.prompt).toContain('just speak your answer');
    expect(e.state.prompt).toContain('What is photosynthesis?');
    expect(e.state.mode).toBe('DICTATING');

    await hear('plants make their own food');
    await hear('they use sunlite and water');
    await hear('oxygen is released');
    expect(e.state.answers[0]).toEqual(['plants make their own food', 'they use sunlite and water', 'oxygen is released']);
    // Words that look like commands inside the answer stay answer text.
    await hear('next question is about matter');
    expect(e.state.answers[0]).toHaveLength(4);
    await hear('scratch that');
    expect(e.state.answers[0]).toHaveLength(3);

    // A tap: the next sentence is an instruction, in the student's own words.
    await tap();
    expect(e.state.instructing).toBe(true);
    await hear('can you read it back to me');
    expect(e.state.prompt).toContain('Answer 1 has 3 sentences.');
    expect(e.state.mode).toBe('DICTATING'); // and recording continues
    expect(e.state.answers[0]).toHaveLength(3); // the instruction was not written

    // "Awaaz" in one breath. Changes happen at once, are read back, and can be undone.
    await hear('Awaaz, change sentence two');
    expect(e.state.prompt).toBe('Sentence 2: they use sunlite and water. Dictate the new sentence now.');
    await hear('they use sunlight water and carbon dioxide');
    expect(e.state.answers[0][1]).toBe('they use sunlight water and carbon dioxide');
    expect(e.state.prompt).toContain('Sentence 2 is now: they use sunlight water and carbon dioxide.');
    expect(e.state.prompt).toContain('To take it back, tap and say undo.');
    expect(e.state.mode).toBe('DICTATING');
    await tap();
    await hear('undo');
    expect(e.state.answers[0][1]).toBe('they use sunlite and water');
    expect(e.state.answers[0]).toHaveLength(3);

    // The misheard "stop answer" still stops, saves at once, and asks nothing.
    await hear('stop and research');
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND');
    expect(e.state.prompt).toContain('Saved.');
    expect(e.state.answers[0]).toHaveLength(3);
    await hear('That was my answer'); // if it really was answer text
    expect(e.state.answers[0].at(-1)).toBe('stop and research');
    expect(e.state.mode).toBe('DICTATING');
    await hear('scratch that');
    expect(e.state.answers[0]).toHaveLength(3);

    // "Awaaz" alone waits for the instruction; silence returns quietly to recording.
    await hear('Awaaz');
    expect(e.state.instructing).toBe(true);
    await vi.advanceTimersByTimeAsync(9000);
    expect(e.state.instructing).toBe(false);
    expect(e.state.mode).toBe('DICTATING');

    await tap();
    await hear('next');
    expect(e.state.current).toBe(1);
    expect(e.state.mode).toBe('DICTATING');
    await hear('solid liquid and gas');
    // An unsure phrase is kept and logged; the student is not stopped to answer a question.
    await hear('plasma too', 0.4);
    expect(e.state.answers[1]).toEqual(['solid liquid and gas', 'plasma too']);
    expect(e.state.mode).toBe('DICTATING');
    expect(e.state.log.some((l) => l.type === 'uncertain_chunk_kept')).toBe(true);

    for (let q = 3; q <= 5; q++) {
      await tap();
      await hear(`go to question ${q}`);
      expect(e.state.current).toBe(q - 1);
      expect(e.state.mode).toBe('DICTATING');
      await hear(`answer for question ${q}`);
    }

    // Multiple choice: everything said is an instruction; no tap needed.
    await tap();
    await hear('next question');
    expect(e.state.current).toBe(5);
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND');
    expect(e.state.prompt).toContain('Which planet is closest to the Sun? It has 4 options.');
    await hear('Option A');
    expect(e.state.prompt).toContain('Option A: Venus.');
    await hear('next');
    expect(e.state.prompt).toContain('Option B: Mercury.');
    await hear('choose a');
    expect(e.state.choices[5]).toEqual({ sel: 0, locked: false });
    expect(e.state.prompt).toContain('Say lock it when you are sure.');
    await hear('let me think');
    expect(e.state.thinking).toBe(true);
    await hear('my answer is B');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: false });
    await hear('C'); // just the letter
    expect(e.state.choices[5]).toEqual({ sel: 2, locked: false });
    await hear('be please'); // "B please", as Chrome writes it
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: false });
    await hear('lock it');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: true });
    await hear('select c'); // changing your mind after locking is allowed; the new pick is not locked
    expect(e.state.choices[5]).toEqual({ sel: 2, locked: false });
    expect(e.state.prompt).toContain('Changed from B to C, Earth. Not locked yet.');
    await hear('lock B');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: true });

    await hear('next question');
    await hear('100 degrees Celsius');
    expect(e.state.choices[6]).toEqual({ sel: 2, locked: false });
    await hear('final answer C');
    expect(e.state.choices[6]).toEqual({ sel: 2, locked: true });
    await hear('next question');
    await hear('I choose carbon dioxide');
    await hear('mark for review');
    expect(e.state.review[7]).toBe(true);

    await hear('How many questions remain?');
    expect(e.state.prompt).toBe('8 answered, 0 remaining.');
    // Submitting is one of only two things that still ask "yes or no".
    await hear('Submit exam');
    expect(e.state.prompt).toContain('You have answered 8 of 8 questions. 0 unanswered. Question 8 has a pick that is not locked; it will be submitted as picked. Marked for review: question 8. Submit now? Yes or no.');
    await hear('yes');
    expect(e.state.submitted).toBe(true);
    await hear('Edit answer');
    expect(e.state.prompt).toContain('locked');
    await hear('Read answer two');
    expect(e.state.prompt).toContain('solid liquid and gas');
  });

  it('Hindi: speak, "बस" to stop, "आवाज़" for an instruction', async () => {
    const { e, hear } = await setup();
    await hear('हिंदी');
    expect(e.state.prompt).toBe('हिंदी चुनी गई। परीक्षा शुरू करने के लिए "परीक्षा शुरू करो" कहें।');
    await hear('परीक्षा शुरू करो');
    expect(e.state.prompt).toContain('(प्रकाश संश्लेषण)');
    expect(e.state.mode).toBe('DICTATING');
    await hear('पौधे सूरज की रोशनी से खाना बनाते हैं');
    await hear('बस');
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND');
    expect(e.state.answers[0]).toEqual(['पौधे सूरज की रोशनी से खाना बनाते हैं']);
    await hear('आवाज़, अगला सवाल');
    expect(e.state.current).toBe(1);
    expect(e.state.mode).toBe('DICTATING');
  });

  it('answers in another Indian language; the app keeps talking in English', async () => {
    const { e, hear } = await setup();
    await hear('Telugu');
    expect(e.state.answerLang).toBe('te-IN');
    expect(e.state.lang).toBe('en-IN');
    expect(e.state.prompt).toContain('written in Telugu');
    await hear('Start exam');
    expect(e.state.mode).toBe('DICTATING');
    expect(e.listenLang()).toBe('te-IN'); // answers are heard in Telugu
    e.wake('tap');
    expect(e.listenLang()).toBe('en-IN'); // instructions in the app's language
    await vi.advanceTimersByTimeAsync(9000);
    expect(e.listenLang()).toBe('te-IN');
    await hear('మొక్కలు ఆహారం తయారు చేస్తాయి');
    expect(e.state.answers[0]).toEqual(['మొక్కలు ఆహారం తయారు చేస్తాయి']);
    // "Awaaz" written in Telugu script, then words the app cannot read: it waits for the instruction.
    await hear('ఆవాజ్ స్టాప్');
    expect(e.state.instructing).toBe(true);
    await hear('stop');
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND');
    expect(e.state.answers[0]).toHaveLength(1);
  });

  it('reminds once after a long silence, never while recording or after "let me think"', async () => {
    const { e, hear } = await setup();
    const reminders = () => e.state.log.filter((l) => l.type === 'silence_prompt').length;
    await hear('English');
    await vi.advanceTimersByTimeAsync(31000);
    expect(e.state.prompt).toContain('still listening');
    expect(reminders()).toBe(1);
    await vi.advanceTimersByTimeAsync(120000);
    expect(reminders()).toBe(1);

    await hear('Start exam');
    await vi.advanceTimersByTimeAsync(180000); // thinking while recording: never interrupted
    expect(reminders()).toBe(1);
    expect(e.state.mode).toBe('DICTATING');
    await hear('hmm');
    expect(e.state.answers[0]).toEqual([]); // thinking sounds are not answer text
    await hear('wait');
    expect(e.state.answers[0]).toEqual([]);
    expect(e.state.prompt).toBe('Take your time.');
    await hear('stop');

    await hear('give me some time');
    expect(e.state.thinking).toBe(true);
    await vi.advanceTimersByTimeAsync(180000);
    expect(reminders()).toBe(1);
  });

  it('spoken punctuation, where am I, speed and custom homework with a timer', async () => {
    const { e, hear } = await setup();
    e.applySetup({ title: 'Homework', questions: ['What is friction?', 'Name two lubricants.'], durationMin: 10 });
    expect(e.state.booted).toBe(false); // changing questions returns to the start screen
    e.begin();
    await vi.advanceTimersByTimeAsync(500);
    await hear('English');
    await hear('Start exam');
    expect(e.state.prompt).toContain('Two questions.');
    expect(e.state.prompt).toContain('What is friction?');
    expect(e.state.timerEndsAt).toBeGreaterThan(Date.now());

    await hear('friction opposes motion full stop it causes heat');
    await hear('full stop');
    expect(e.state.answers[0]).toEqual(['friction opposes motion. it causes heat.']);
    await hear('Stop answer');

    await hear('Where am I');
    expect(e.state.prompt).toContain('Question 1 of 2. This answer has 2 sentences. 1 of 2 questions answered.');
    expect(e.state.prompt).toMatch(/minutes? \d+ seconds left/);
    const rate = e.state.settings.rate;
    await hear('Speak slower');
    expect(e.state.settings.rate).toBeLessThan(rate);
    await hear('Go to question five');
    expect(e.state.prompt).toBe('There are only 2 questions. Say a number from one to 2.');

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 5000); // 10 minutes + compensatory time (20 min/hour, at least 5, in multiples of 5)
    expect(e.state.mode === 'CONFIRMING' || e.state.nextMode === 'CONFIRMING').toBe(true);
    expect(e.state.prompt).toContain('Time is up.');
    expect(e.state.prompt).toContain('You have answered 1 of 2 questions.');
  });

  it('long answers: paragraphs, commands mid-answer, quick fixes and undo', async () => {
    const { e, hear } = await setup();
    const { getSentences, paragraphs } = await import('./sentences.js');
    const sents = () => getSentences(e.state.answers[0]);
    await hear('English');
    await hear('Start exam');
    await hear('plants make food full stop they use sunlite');
    await hear('new paragraph');
    await hear('oxygen is released full stop it helps us breathe');
    expect(e.state.answers[0]).toEqual(['plants make food. they use sunlite\n', 'oxygen is released. it helps us breathe']);

    // A whole command said without a tap still works: the answer is kept and the command runs.
    await hear('Go to question 4');
    expect(e.state.current).toBe(3);
    await hear('That was my answer');
    expect(e.state.current).toBe(0);
    expect(e.state.answers[0].at(-1)).toBe('Go to question 4');
    await hear('scratch that');

    // Fix one word: applied at once, read back, recording continues.
    await hear('Awaaz, change sunlite to sunlight');
    expect(e.state.prompt).toContain('Sentence 2 is now: they use sunlight.');
    expect(e.state.mode).toBe('DICTATING');
    await hear('Awaaz insert after sentence 1');
    await hear('this is called photosynthesis.');
    await hear('Awaaz replace the last sentence');
    expect(e.state.prompt).toContain('Sentence 5: it helps us breathe');
    await hear('animals need it to breathe.');
    expect(sents()).toEqual(['plants make food.', 'this is called photosynthesis.', 'they use sunlight', 'oxygen is released.', 'animals need it to breathe.']);
    expect(paragraphs(e.state.answers[0])).toHaveLength(2);

    // Clearing a whole answer is the other thing that still asks first.
    await hear('Awaaz clear answer');
    expect(e.state.mode === 'CONFIRMING' || e.state.nextMode === 'CONFIRMING').toBe(true);
    await hear('yes');
    expect(sents()).toHaveLength(0);
    await hear('undo');
    expect(sents()).toHaveLength(5);

    // While recording, a long sentence is answer text unless the student taps or says "Awaaz".
    await hear('Awaaz, can you please go to question three');
    expect(e.state.current).toBe(2);
  });

  it('the sentence editor: one sentence at a time, single words, changes at once', async () => {
    const { e, hear } = await setup();
    const { getSentences, paragraphs } = await import('./sentences.js');
    const sents = () => getSentences(e.state.answers[0]);
    await hear('English');
    await hear('Start exam');
    // "next sentence" / "next para" are breaks, never answer text.
    await hear('photosynthesis is how green plants make their food next sentence');
    await hear('they use sunlite water and carbon dioxide from the air and the energy of light is captured by chlorophyll in the leaves');
    await hear('next para');
    await hear('oxygen is released next sentence animals breathe this oxygen');
    expect(sents()).toHaveLength(4);
    expect(paragraphs(e.state.answers[0])).toHaveLength(2);
    expect(e.state.answers[0].join(' ')).not.toMatch(/next (sentence|para)/);
    await hear('stop');

    await hear('Edit answer');
    expect(e.state.prompt).toBe('Answer 1 has 4 sentences. What should I change?');
    expect(e.state.prompt).not.toMatch(/Read words to hear|Delete this, Rewrite this/); // no recited list
    await hear('next');
    expect(e.state.cursor).toBe(1);

    await hear('read words');
    expect(e.state.prompt).toContain('1, they. 2, use. 3, sunlite. 4, water');
    await hear('change word 3');
    expect(e.state.prompt).toBe('Word 3 of sentence 2 is: sunlite. Say the new word now.');
    await hear('sunlight');
    expect(sents()[1].startsWith('they use sunlight water')).toBe(true);
    expect(e.state.prompt).toContain('Sentence 2 is now:');
    expect(e.state.mode).toBe('EDIT_COMMAND');

    await hear('fix chlorophyl');
    expect(e.state.prompt).toContain('is: chlorophyll');
    await hear('chloroplasts');
    expect(sents()[1]).toContain('captured by chloroplasts in the leaves');

    await hear('next paragraph');
    expect(e.state.cursor).toBe(2);
    await hear('next');
    await hear('delete word 3');
    expect(sents()[3]).toBe('animals breathe oxygen');
    await hear('next');
    expect(e.state.prompt).toContain('That was the last sentence');

    await hear('replace the third line with oxygen comes out of the leaves');
    expect(sents()[2]).toBe('oxygen comes out of the leaves');
    await hear('add after green plants and algae');
    expect(sents()[0]).toBe('photosynthesis is how green plants and algae make their food.');

    await hear('delete this');
    expect(e.state.prompt).toContain('Sentence 1 deleted: photosynthesis is how green plants and algae make their food.');
    expect(sents()).toHaveLength(3);
    await hear('undo');
    expect(sents()).toHaveLength(4);

    // Everyday words still work in the editor.
    await hear('delete statement 1');
    expect(e.state.understood).toBe('Delete sentence 1');
    expect(sents()).toHaveLength(3);
    await hear('undo');
    await hear('banana');
    expect(e.state.understood).toBe('—');
    expect(e.state.mode).toBe('EDIT_COMMAND');

    await hear('done');
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND'); // the student had stopped recording
    await hear('next'); // outside the editor, "next" means next question
    expect(e.state.current).toBe(1);
    expect(e.state.mode).toBe('DICTATING');
  });

  it('Hindi edit flow', async () => {
    const { e, hear } = await setup();
    const { getSentences } = await import('./sentences.js');
    await hear('हिंदी');
    await hear('परीक्षा शुरू करो');
    await hear('पौधे भोजन बनाते हैं');
    await hear('इसमें धूप लगती है');
    await hear('जवाब पूरा हुआ');
    await hear('उत्तर बदलो');
    await hear('वाक्य एक डिलीट करो');
    expect(getSentences(e.state.answers[0])).toEqual(['इसमें धूप लगती है']);
  });
});

describe('multiple choice by voice', () => {
  it('picks by the option words even when they contain command words', async () => {
    const { e, hear } = await setup();
    await hear('English');
    await hear('Start exam');
    await hear('Go to question 6');
    await hear('my answer is mercury');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: false });
    await hear('what are the options');
    expect(e.state.prompt).toContain('Option A: Venus. Option B: Mercury. Option C: Earth. Option D: Mars.');
    expect(e.state.prompt).toContain('Option B picked, not locked yet.');
    await hear('option see');
    expect(e.state.prompt).toContain('Option C: Earth.');
    await hear('Unlock');
    expect(e.state.prompt).toContain('not locked yet');
    await hear('confirm');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: true });
    await hear('change my answer');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: false });
    await hear('clear my selection');
    expect(e.state.choices[5]).toBeNull();
    await hear('Start answer');
    expect(e.state.prompt).toBe('This question has options. Say your answer, like B.');
    await hear('Go to question 1');
    expect(e.state.mode).toBe('DICTATING');
    await hear('Awaaz choose b');
    expect(e.state.prompt).toContain('needs a written answer');
  });
});

describe('real exam rules', () => {
  it('compensatory time: 20 minutes per hour, pro-rata, at least 5, in multiples of 5', async () => {
    const { compensatoryMinutes, totalMinutes } = await import('./engine.js');
    expect(compensatoryMinutes(180)).toBe(60); // CBSE: 60 minutes for a 3-hour paper
    expect(compensatoryMinutes(150)).toBe(50);
    expect(compensatoryMinutes(60)).toBe(20);
    expect(compensatoryMinutes(45)).toBe(15);
    expect(compensatoryMinutes(10)).toBe(5);
    expect(totalMinutes({ durationMin: 30, extraTime: true })).toBe(40);
    expect(totalMinutes({ durationMin: 30, extraTime: false })).toBe(30);
  });

  it('a paper set in Hindi by the teacher skips the language question and stays in Hindi', async () => {
    const { e, hear } = await setup();
    e.applySetup({ title: 'गृहकार्य', questions: ['घर्षण क्या है?'], durationMin: 0, lang: 'hi-IN' });
    e.begin();
    await vi.advanceTimersByTimeAsync(500);
    expect(e.state.lang).toBe('hi-IN');
    expect(e.state.prompt).toContain('परीक्षा शुरू करो');
    await hear('change language');
    expect(e.state.prompt).toContain('हिंदी में रखा है');
    expect(e.state.lang).toBe('hi-IN');
  });

  it('prints an integrity record built from the log', async () => {
    const { e, hear } = await setup();
    await hear('English');
    await hear('Start exam');
    await hear('plants make food');
    await hear('they use sunlight');
    await hear('stop');
    await hear('Delete sentence 2');
    const r = e.integrity(0);
    expect(r.dictated).toBe(2);
    expect(r.edits).toBe(1);
  });
});

describe('what went wrong in the 24 Nov test session', () => {
  it('multiple choice: free switching, resume on return, everyday phrasing', async () => {
    const { e, hear } = await setup();
    await hear('English');
    await hear('Start exam');
    await hear('Awaaz go to question 6');
    // "read all option" (Chrome dropped the s) must read the options, never pick "Earth"
    await hear('read all option');
    expect(e.state.prompt).toContain('Option A: Venus. Option B: Mercury. Option C: Earth. Option D: Mars.');
    expect(e.state.choices[5]).toBeNull();
    await hear('choose option C');
    await hear('lock it');
    expect(e.state.choices[5]).toEqual({ sel: 2, locked: true });
    await hear('next question');
    await hear('go back');
    // Back on the question: where things stand, not the whole routine again.
    expect(e.state.current).toBe(5);
    expect(e.state.prompt).toContain('Question 6. Your answer is C, Earth, locked.');
    expect(e.state.prompt).not.toContain('It has 4 options');
    // Change straight away, in everyday words, without unlocking first.
    await hear('I want to choose option B');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: false });
    expect(e.state.prompt).toContain('Changed from C to B, Mercury.');
    await hear('switch to option c'); // "to" is not option 2
    expect(e.state.choices[5].sel).toBe(2);
    await hear('can you mark option d for me');
    expect(e.state.choices[5].sel).toBe(3);
    await hear('read option a again');
    expect(e.state.prompt).toContain('Option A: Venus.');
    expect(e.state.choices[5].sel).toBe(3);
    await hear('back to option');
    expect(e.state.prompt).toContain('Option A: Venus. Option B: Mercury.');
    await hear('make it B please');
    await hear('final');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: true });
    await hear('banana bread');
    expect(e.state.prompt).toBe('Sorry, I did not understand. Please say it another way.');
    expect(e.state.choices[5]).toEqual({ sel: 1, locked: true });
  });

  it('"Awaaz" in the middle of a spoken sentence still works', async () => {
    const { e, hear } = await setup();
    await hear('English');
    await hear('Start exam');
    await hear('plants make their own food awaaz read my answer');
    expect(e.state.answers[0]).toEqual(['plants make their own food']);
    expect(e.state.prompt).toContain('Answer 1 has 1 sentence');
    expect(e.state.mode).toBe('DICTATING');
    await hear('they use sunlight awas stop'); // another way Chrome writes it
    expect(e.state.answers[0]).toEqual(['plants make their own food', 'they use sunlight']);
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND');
    // Coming back to a written question resumes it.
    await hear('next question');
    await hear('previous question');
    expect(e.state.prompt).toContain('Question 1. Your answer has 2 sentences.');
    expect(e.state.mode).toBe('DICTATING');
  });
});

describe('editing like talking to a scribe (24 Nov, second session)', () => {
  it('"change biogas to …" works however Chrome writes it, and editing does not recite instructions', async () => {
    const { e, hear } = await setup();
    const { getSentences } = await import('./sentences.js');
    const sents = () => getSentences(e.state.answers[0]);
    await hear('English');
    await hear('Start exam');
    await hear('plants make their own food full stop by which it took us biogas');
    await hear('stop');
    await hear('edit my answer');
    expect(e.state.prompt.split(/\s+/).length).toBeLessThan(30);
    expect(e.state.prompt).toBe('Answer 1 has 2 sentences. What should I change?');
    await hear('change biogas 2 biofuel'); // Chrome wrote "to" as "2"
    expect(sents()[1]).toBe('by which it took us biofuel');
    expect(e.state.prompt).toContain('Sentence 2 is now: by which it took us biofuel.');
    await hear('undo');
    expect(sents()[1]).toBe('by which it took us biogas');
    await hear('change bio gas to bio fuel'); // split differently from the answer
    expect(sents()[1]).toBe('by which it took us bio fuel');
    await hear('undo');
    await hear('chains biogas too sunlight'); // "change" misheard, "to" as "too"
    expect(sents()[1]).toBe('by which it took us sunlight');
    await hear('done');
    // From recording, with "Awaaz", in Hinglish.
    await hear('start answer');
    await hear('awaaz sunlight ko biogas karo');
    expect(sents()[1]).toBe('by which it took us biogas');
    expect(e.state.mode).toBe('DICTATING');
  });

  it('"Awaaz" as the recogniser may spell it, or only in a second alternative', async () => {
    const { e, hear } = await setup();
    await hear('English');
    await hear('Start exam');
    await hear('plants make food');
    await hear('aawaj stop');
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND');
    await hear('start answer');
    // Only the second alternative has the wake word.
    e.io.session += 1;
    e.onFinal('always read my answer', 0.8, ['always read my answer', 'awaaz read my answer']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(e.state.prompt).toContain('Answer 1 has 1 sentence');
    expect(e.state.answers[0]).toEqual(['plants make food']);
  });
});

describe('editing by naming the words (25 Nov screenshot)', () => {
  it('"delete under" removes the word, with no numbers and nothing to memorise', async () => {
    const { e, hear } = await setup();
    const { getSentences } = await import('./sentences.js');
    const sents = () => getSentences(e.state.answers[0]);
    await hear('English');
    await hear('Start exam');
    await hear('photosynthesis is the process by which plants create their own food under using sunlight');
    await hear('stop');
    await hear('edit my answer');
    expect(e.state.prompt).toBe('Answer 1 has 1 sentence. What should I change?');
    await hear('delete under');
    expect(sents()[0]).toBe('photosynthesis is the process by which plants create their own food using sunlight');
    expect(e.state.prompt).toContain('Sentence 1 is now:');
    await hear('undo');
    await hear('remove the word under');
    expect(sents()[0]).not.toContain(' under ');
    await hear('add water after using');
    expect(sents()[0]).toContain('using water sunlight');
    await hear('change water to light and');
    expect(sents()[0]).toContain('using light and sunlight');
    // From recording, with a tap, in Hinglish.
    await hear('done');
    await hear('start answer');
    e.wake('tap');
    await hear('light and hatao');
    expect(sents()[0]).toContain('food using sunlight');
    expect(e.state.mode).toBe('DICTATING');
  });

  it('no spoken or on-screen lists of commands', async () => {
    const { msg, ui } = await import('../i18n.js');
    for (const l of ['en-IN', 'hi-IN', 'ta-IN']) {
      for (const k of ['instrUnknown', 'instrUnknownMcq', 'unknownCommand', 'editAsk', 'answerSaved']) {
        expect(msg(l, k).split(/[,·]/).length).toBeLessThanOrEqual(2);
      }
      for (const v of Object.values(ui(l).sayNow)) expect(String(v).split('·').length).toBe(1);
    }
  });
});

describe('"stop" inside an answer is answer text', () => {
  it('"stop air pollution" is saved verbatim; "stop and research" and "stop answer" stop', async () => {
    const { e, hear } = await setup();
    await hear('English');
    await hear('Start exam');
    await hear('stop air pollution');
    expect(e.state.answers[0]).toEqual(['stop air pollution']);
    expect(e.state.mode).toBe('DICTATING');
    await hear('stop cutting trees');
    expect(e.state.answers[0]).toHaveLength(2);
    await hear('stop and research');
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND');
    expect(e.state.answers[0]).toHaveLength(2);
    await hear('start answer');
    await hear('stop answering');
    expect(e.state.mode).toBe('LISTENING_FOR_COMMAND');
  });
});
