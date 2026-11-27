// Text from an uploaded question paper. Everything runs in the browser; the file is not uploaded anywhere.
// PDFs need selectable text. A scanned paper (a photo of each page) has no text layer and is reported.

export async function fileToText(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.txt') || file.type === 'text/plain') return { text: await file.text(), pages: 1, kind: 'text' };
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return pdfToText(file);
  throw new Error('Please choose a PDF or a .txt file. For a Word file, save it as PDF first.');
}

async function pdfToText(file) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Rebuild lines: items on the same baseline (within a tolerance) form one line, left to right.
    const rows = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const tol = Math.max(2, (it.height || 10) * 0.45);
      let row = rows.find((r) => Math.abs(r.y - y) <= tol);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, w: it.width || 0, str: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let line = '';
      let end = null;
      for (const it of r.items) {
        if (end !== null && it.x - end > 1.5 && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' ';
        line += it.str;
        end = it.x + it.w;
      }
      if (line.trim()) lines.push(line.trim());
    }
    lines.push('');
  }
  const text = lines.join('\n');
  const scanned = text.replace(/\s/g, '').length < 40 * doc.numPages;
  return { text, pages: doc.numPages, kind: 'pdf', scanned };
}
