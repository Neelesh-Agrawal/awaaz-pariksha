import { describe, it, expect } from 'vitest';
import { parsePaper } from './paperParser.js';

describe('question paper parser', () => {
  it('reads a CBSE-style paper with options, marks and an answer key', () => {
    const text = `Kendriya Vidyalaya
Class 8 Science – Unit Test 2
General Instructions: All questions are compulsory.
Section A
1. Which planet is closest to the Sun? [1 mark]
(a) Venus (b) Mercury (c) Earth (d) Mars
Answer: (b)
2. Which gas do plants take in to make food?
a) Oxygen
b) Nitrogen
c) Carbon dioxide
d) Hydrogen
Section B
3. What is photosynthesis? Explain with an
example. (3 marks)
Page 1 of 2
4. Name three states of matter. [2 marks]`;
    const r = parsePaper(text);
    expect(r.title).toBe('Kendriya Vidyalaya');
    expect(r.questions).toHaveLength(4);
    expect(r.questions[0]).toEqual({ text: 'Which planet is closest to the Sun?', type: 'mcq', options: ['Venus', 'Mercury', 'Earth', 'Mars'], marks: 1 });
    expect(r.questions[1].options).toEqual(['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen']);
    expect(r.questions[2]).toEqual({ text: 'What is photosynthesis? Explain with an example.', type: 'text', marks: 3 });
    expect(r.questions[3].marks).toBe(2);
    expect(r.warnings.join(' ')).toContain('answer-key');
  });

  it('reads Q-numbering, NEET-style (1) options and numbered options', () => {
    const r = parsePaper(`Q1. Unit of force is
(1) joule (2) newton (3) watt (4) pascal
Q2) The boiling point of water is
1) 0 °C
2) 50 °C
3) 100 °C
4) 200 °C
Q3. Define speed.`);
    expect(r.questions.map((q) => q.type)).toEqual(['mcq', 'mcq', 'text']);
    expect(r.questions[0].options).toEqual(['joule', 'newton', 'watt', 'pascal']);
    expect(r.questions[1].options).toEqual(['0 °C', '50 °C', '100 °C', '200 °C']);
    expect(r.questions[2].text).toBe('Define speed.');
  });

  it('reads Hindi and Tamil papers', () => {
    const hi = parsePaper(`प्रश्न 1. सूरज के सबसे पास कौन सा ग्रह है? (1 अंक)
(क) शुक्र (ख) बुध (ग) पृथ्वी (घ) मंगल
प्रश्न 2. वाष्पीकरण क्या है?`);
    expect(hi.questions[0]).toEqual({ text: 'सूरज के सबसे पास कौन सा ग्रह है?', type: 'mcq', options: ['शुक्र', 'बुध', 'पृथ्वी', 'मंगल'], marks: 1 });
    expect(hi.questions[1].type).toBe('text');
    const ta = parsePaper(`1. சூரியனுக்கு அருகில் உள்ள கோள் எது?
(அ) வெள்ளி (ஆ) புதன் (இ) பூமி (ஈ) செவ்வாய்`);
    expect(ta.questions[0].options).toEqual(['வெள்ளி', 'புதன்', 'பூமி', 'செவ்வாய்']);
  });

  it('falls back to one question per line', () => {
    const r = parsePaper('What is friction?\nGive two examples of friction.');
    expect(r.questions).toEqual([
      { text: 'What is friction?', type: 'text' },
      { text: 'Give two examples of friction.', type: 'text' },
    ]);
  });

  it('reads the sample paper, its time limit, and drops a loose answer-key line', async () => {
    const fs = await import('node:fs');
    const r = parsePaper(fs.readFileSync('samples/sample-paper.txt', 'utf8'));
    expect(r.title).toBe('Class 8 Science - Unit Test 2');
    expect(r.minutes).toBe(30);
    expect(r.questions.map((q) => q.type)).toEqual(['mcq', 'mcq', 'mcq', 'text', 'text', 'text', 'text']);
    expect(r.questions[2].options).toEqual(['0 C', '50 C', '100 C', '200 C']);
    expect(r.questions[6]).toEqual({ text: 'Name three states of matter and give one example of each.', type: 'text', marks: 2 });
    expect(r.warnings.join(' ')).toContain('answer-key');
  });

  it('warns about questions that need a figure, map or graph', () => {
    const r = parsePaper(['1. Label the parts of the flower shown in the figure.', '2. What is pollination?', '3. मानचित्र में दिल्ली दिखाइए।'].join('\n'));
    expect(r.warnings.join(' ')).toContain('Question 1, 3 seem to need a figure');
  });
});
