// Writes samples/sample-paper.pdf and .txt: a small mixed paper for trying "Upload question paper".
// Run: node scripts/make-sample-paper.mjs
import fs from 'node:fs';

const lines = [
  'Class 8 Science - Unit Test 2',
  'Time: 30 minutes    Maximum marks: 12',
  'Section A - Multiple choice',
  '1. Which planet is closest to the Sun? [1 mark]',
  '(a) Venus (b) Mercury (c) Earth (d) Mars',
  '2. Which gas do plants take in from the air to make food? [1 mark]',
  'a) Oxygen',
  'b) Nitrogen',
  'c) Carbon dioxide',
  'd) Hydrogen',
  '3. Water boils at sea level at: [1 mark]',
  '(1) 0 C   (2) 50 C   (3) 100 C   (4) 200 C',
  'Section B - Answer in your own words',
  '4. What is photosynthesis? Explain with an example. [3 marks]',
  '5. What causes day and night? [2 marks]',
  '6. Give two ways to save water at home. [2 marks]',
  '7. Name three states of matter and give one example of each. [2 marks]',
  'Answer key (for teacher): 1-b, 2-c, 3-3',
];

const esc = (l) => l.replace(/[()\\]/g, (m) => `\\${m}`);
const content = `BT /F1 12 Tf 56 780 Td 18 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n';
const offsets = [];
objs.forEach((o, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

fs.mkdirSync('samples', { recursive: true });
fs.writeFileSync('samples/sample-paper.pdf', pdf, 'latin1');
fs.writeFileSync('samples/sample-paper.txt', `${lines.join('\n')}\n`);
console.log('Wrote samples/sample-paper.pdf and samples/sample-paper.txt');
