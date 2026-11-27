import { describe, it, expect } from 'vitest';
import { parseCommand, parseDictationCommand, parseLanguage, parseNumber, parseYesNo } from './commandParser.js';
import { getSentences } from './sentences.js';

describe('START_ANSWER variants', () => {
  it.each([
    ['Start answer', 'en-IN'],
    ['start answer.', 'hi-IN'],
    ['स्टार्ट आंसर', 'hi-IN'],
    ['उत्तर शुरू करो', 'hi-IN'],
    ['பதிலை தொடங்கு', 'ta-IN'],
    ['பதிலைத் தொடங்கு', 'ta-IN'],
  ])('%s (%s)', (text, lang) => {
    expect(parseCommand(text, lang)).toEqual({ type: 'START_ANSWER' });
  });
  it('does not accept Hindi phrases when Tamil is selected', () => {
    expect(parseCommand('उत्तर शुरू करो', 'ta-IN')).toBeNull();
  });
});

describe('numbers and navigation', () => {
  it.each([
    ['Go to question two', 'en-IN', 2],
    ['go to question 3', 'en-IN', 3],
    ['question five', 'en-IN', 5],
    ['प्रश्न दो पर जाओ', 'hi-IN', 2],
    ['प्रश्न ३ पर जाएं', 'hi-IN', 3],
    ['கேள்வி இரண்டுக்குச் செல்', 'ta-IN', 2],
    ['கேள்வி மூன்றுக்கு செல்', 'ta-IN', 3],
  ])('%s → GOTO %i', (text, lang, n) => {
    expect(parseCommand(text, lang)).toEqual({ type: 'GOTO', n });
  });
  it('parses ordinals', () => {
    expect(parseNumber('second')).toBe(2);
    expect(parseNumber('दूसरा')).toBe(2);
    expect(parseNumber('இரண்டாவது')).toBe(2);
    expect(parseNumber('2nd')).toBe(2);
  });
  it.each([
    ['Next question', 'NEXT'],
    ['previous question', 'PREV'],
    ['How many questions remain?', 'REMAINING'],
    ['Submit exam', 'SUBMIT'],
    ['Repeat question', 'REPEAT_QUESTION'],
    ['Start exam', 'START_EXAM'],
    ['Help', 'HELP'],
  ])('%s → %s', (text, type) => {
    expect(parseCommand(text, 'en-IN').type).toBe(type);
  });
  it('Hindi start exam', () => {
    expect(parseCommand('परीक्षा शुरू करो', 'hi-IN')).toEqual({ type: 'START_EXAM' });
    expect(parseCommand('तेर्वை', 'hi-IN')).toBeNull();
  });
  it('Tamil start exam and submit', () => {
    expect(parseCommand('தேர்வைத் தொடங்கு', 'ta-IN')).toEqual({ type: 'START_EXAM' });
    expect(parseCommand('தேர்வைச் சமர்ப்பி', 'ta-IN')).toEqual({ type: 'SUBMIT' });
  });
});

describe('review and edit', () => {
  it.each([
    ['Read my answer', 'en-IN', { type: 'READ_ANSWER' }],
    ['Read answer two', 'en-IN', { type: 'READ_ANSWER', n: 2 }],
    ['मेरा उत्तर पढ़ो', 'hi-IN', { type: 'READ_ANSWER' }],
    ['उत्तर दो पढ़ो', 'hi-IN', { type: 'READ_ANSWER', n: 2 }],
    ['பதில் இரண்டைப் படி', 'ta-IN', { type: 'READ_ANSWER', n: 2 }],
    ['Replace sentence two', 'en-IN', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['replace the second sentence', 'en-IN', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['वाक्य दो बदलो', 'hi-IN', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['வாக்கியம் இரண்டை மாற்று', 'ta-IN', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['Delete sentence 2', 'en-IN', { type: 'DELETE_SENTENCE', n: 2 }],
    ['वाक्य दो हटाओ', 'hi-IN', { type: 'DELETE_SENTENCE', n: 2 }],
    ['Add to answer', 'en-IN', { type: 'ADD_TO_ANSWER' }],
    ['उत्तर में जोड़ो', 'hi-IN', { type: 'ADD_TO_ANSWER' }],
    ['Undo', 'en-IN', { type: 'UNDO' }],
    ['पूर्ववत करो', 'hi-IN', { type: 'UNDO' }],
    ['செயல்தவிர்', 'ta-IN', { type: 'UNDO' }],
    ['Edit answer', 'en-IN', { type: 'EDIT_ANSWER' }],
  ])('%s (%s)', (text, lang, expected) => {
    expect(parseCommand(text, lang)).toEqual(expected);
  });
  it('confirmation words', () => {
    expect(parseCommand('Confirm', 'en-IN').type).toBe('CONFIRM');
    expect(parseCommand('Confirm change', 'en-IN').type).toBe('CONFIRM');
    expect(parseCommand('try again', 'en-IN').type).toBe('TRY_AGAIN');
    expect(parseCommand('पुष्टि करें', 'hi-IN').type).toBe('CONFIRM');
    expect(parseCommand('जारी रखें', 'hi-IN').type).toBe('CONTINUE');
    expect(parseCommand('உறுதி செய்', 'ta-IN').type).toBe('CONFIRM');
    expect(parseCommand('Keep', 'en-IN').type).toBe('KEEP');
    expect(parseCommand('Repeat', 'en-IN').type).toBe('REPEAT');
  });
});

describe('dictation interception is strict', () => {
  it('only standalone stop/pause are commands', () => {
    expect(parseDictationCommand('Stop answer', 'en-IN')).toEqual({ type: 'STOP_ANSWER' });
    expect(parseDictationCommand('pause', 'en-IN')).toEqual({ type: 'PAUSE' });
    expect(parseDictationCommand('उत्तर बंद करो', 'hi-IN')).toEqual({ type: 'STOP_ANSWER' });
    expect(parseDictationCommand('பதிலை நிறுத்து', 'ta-IN')).toEqual({ type: 'STOP_ANSWER' });
    expect(parseDictationCommand('the plant will stop answer growing', 'en-IN')).toBeNull();
    expect(parseDictationCommand('Next question', 'en-IN')).toBeNull();
    expect(parseDictationCommand('please pause', 'en-IN')).toBeNull();
    expect(parseDictationCommand('Help', 'en-IN')).toBeNull();
  });
  it('restore phrase', () => {
    expect(parseDictationCommand('That was my answer', 'en-IN')).toEqual({ type: 'THAT_WAS_MY_ANSWER' });
    expect(parseDictationCommand('वह मेरा उत्तर था', 'hi-IN')).toEqual({ type: 'THAT_WAS_MY_ANSWER' });
  });
});

describe('language selection', () => {
  it.each([
    ['English', 'en-IN'],
    ['Hindi', 'hi-IN'],
    ['हिंदी।', 'hi-IN'],
    ['Tamil', 'ta-IN'],
    ['தமிழ்', 'ta-IN'],
    ['I want Hindi please', 'hi-IN'],
  ])('%s', (text, code) => expect(parseLanguage(text)).toBe(code));
  it('ambiguous or unknown → null', () => {
    expect(parseLanguage('English or Hindi')).toBeNull();
    expect(parseLanguage('French')).toBeNull();
  });
});

describe('sentences', () => {
  it('splits at punctuation and keeps chunks otherwise', () => {
    expect(getSentences(['Plants make food. They use sunlight.', 'chlorophyll is green'])).toEqual([
      'Plants make food.',
      'They use sunlight.',
      'chlorophyll is green',
    ]);
    expect(getSentences(['पौधे भोजन बनाते हैं। वे धूप का उपयोग करते हैं।'])).toHaveLength(2);
    expect(getSentences(['The value is 3.5 units'])).toEqual(['The value is 3.5 units']);
  });
});

describe('edit commands as people actually say them', () => {
  it.each([
    ['delete statement 1', { type: 'DELETE_SENTENCE', n: 1 }],
    ['Delete statement one.', { type: 'DELETE_SENTENCE', n: 1 }],
    ['delete sentence number 1', { type: 'DELETE_SENTENCE', n: 1 }],
    ['delete sentence no. 1', { type: 'DELETE_SENTENCE', n: 1 }],
    ['delete sentences 1', { type: 'DELETE_SENTENCE', n: 1 }],
    ['delete line 1', { type: 'DELETE_SENTENCE', n: 1 }],
    ['delete the first line', { type: 'DELETE_SENTENCE', n: 1 }],
    ['sentence 1 delete', { type: 'DELETE_SENTENCE', n: 1 }],
    ['please delete number one', { type: 'DELETE_SENTENCE', n: 1 }],
    ['delete the last sentence', { type: 'DELETE_SENTENCE', n: -1 }],
    ['edit statement 2', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['edit sentence two', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['rewrite sentence 2', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['correct line 2', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['replace statement 2', { type: 'REPLACE_SENTENCE', n: 2 }],
    ['add statement', { type: 'ADD_TO_ANSWER' }],
    ['add a sentence', { type: 'ADD_TO_ANSWER' }],
    ['add', { type: 'ADD_TO_ANSWER' }],
    ['insert after statement 1', { type: 'INSERT_AFTER', n: 1 }],
    ['read statement 3', { type: 'READ_SENTENCE', n: 3 }],
    ['edit answers', { type: 'EDIT_ANSWER' }],
  ])('%s', (text, expected) => expect(parseCommand(text, 'en-IN')).toEqual(expected));

  it.each([
    ['वाक्य एक डिलीट करो', { type: 'DELETE_SENTENCE', n: 1 }],
    ['डिलीट सेंटेंस वन', { type: 'DELETE_SENTENCE', n: 1 }],
    ['पहली लाइन हटाओ', { type: 'DELETE_SENTENCE', n: 1 }],
    ['वाक्य दो एडिट करो', { type: 'REPLACE_SENTENCE', n: 2 }],
  ])('%s (hi)', (text, expected) => expect(parseCommand(text, 'hi-IN')).toEqual(expected));

  it('answer text is not mistaken for an edit', () => {
    expect(parseCommand('plants make food', 'en-IN')).toBeNull();
    expect(parseCommand('go to question 2', 'en-IN')).toEqual({ type: 'GOTO', n: 2 });
    expect(parseCommand('read answer 2', 'en-IN')).toEqual({ type: 'READ_ANSWER', n: 2 });
  });

  it('yes / no replies', () => {
    for (const y of ['yes', 'yes delete it', 'ok', 'okay', 'sure', 'हां', 'ठीक है', 'சரி']) expect(parseYesNo(y)).toBe('yes');
    for (const n of ['no', 'no try again', 'नहीं', 'இல்லை']) expect(parseYesNo(n)).toBe('no');
  });
});

describe('instructions after a tap or "Awaaz"', () => {
  it('finds the wake word in every script, only at the start', async () => {
    const { stripWake } = await import('./commandParser.js');
    expect(stripWake('Awaaz, read my answer')).toEqual({ found: true, rest: 'read my answer' });
    expect(stripWake('awaz stop').rest).toBe('stop');
    expect(stripWake('आवाज़ अगला सवाल').found).toBe(true);
    expect(stripWake('ஆவாஸ் அடுத்த கேள்வி').rest).toBe('அடுத்த கேள்வி');
    expect(stripWake('ఆవాజ్ స్టాప్').found).toBe(true);
    expect(stripWake('Awards were given to him').found).toBe(false);
    expect(stripWake('the awaaz of the people').found).toBe(false);
  });
  it('understands instructions generously', async () => {
    const { parseInstruction } = await import('./commandParser.js');
    const t = (x, l = 'en-IN') => parseInstruction(x, l)?.type;
    expect(t('stop and research')).toBe('STOP_ANSWER');
    expect(t('can you read it back to me')).toBe('READ_ANSWER');
    expect(t('answer padho')).toBe('READ_ANSWER');
    expect(t('go to the next one')).toBe('NEXT_ITEM');
    expect(t('go back')).toBe('PREV_ITEM');
    expect(t('how much time do we have')).toBe('TIME_LEFT');
    expect(t('ok submit it')).toBe('SUBMIT');
    expect(t('what was that question again')).toBe('REPEAT_QUESTION');
    expect(t('बस हो गया', 'hi-IN')).toBe('STOP_ANSWER');
    expect(t('जवाब सुनाओ', 'hi-IN')).toBe('READ_ANSWER');
    expect(t('நேரம் எவ்வளவு', 'ta-IN')).toBe('TIME_LEFT');
    expect(parseInstruction('I want to change the second line', 'en-IN')).toEqual({ type: 'REPLACE_SENTENCE', n: 2 });
    expect(parseInstruction('can you please go to question four', 'en-IN')).toEqual({ type: 'GOTO', n: 4 });
  });
});
