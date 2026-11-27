// Teacher / parent setup: upload a question paper (PDF or .txt) or type one, review what was
// understood, set the time, save. The student then takes it entirely by voice.
import React, { useMemo, useRef, useState } from 'react';
import { parsePaper } from '../lib/paperParser.js';
import { fileToText } from '../lib/pdfText.js';
import { COMPENSATORY_MIN_PER_HOUR, compensatoryMinutes, totalMinutes, DEFAULT_SETUP } from '../lib/engine.js';
import { onDeviceStatus, installOnDevice } from '../lib/speech.js';
import { LANGS, LANG_NAMES, ANSWER_LANGS } from '../i18n.js';
import { OPTION_LETTERS } from '../data/questions.js';
import { Upload } from './Icons.jsx';

const toText = (qs) =>
  qs
    .map((q, i) => [`${i + 1}. ${q.text}${q.marks ? ` [${q.marks} marks]` : ''}`, ...(q.options || []).map((o, k) => `(${OPTION_LETTERS[k].toLowerCase()}) ${o}`)].join('\n'))
    .join('\n');

export function TeacherSetup({ engine, s }) {
  const custom = s.setup.questions;
  const [title, setTitle] = useState(custom ? s.setup.title : '');
  const [text, setText] = useState(custom ? toText(custom) : '');
  const [minutes, setMinutes] = useState(s.setup.durationMin || 0);
  const [extra, setExtra] = useState(s.setup.extraTime !== false);
  const [lang, setLang] = useState(s.setup.lang || '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const parsed = useMemo(() => parsePaper(text), [text]);
  const qs = parsed.questions;
  const mcqs = qs.filter((q) => q.type === 'mcq').length;
  const hasAnswers = s.answers.some((a) => a.length) || s.choices.some(Boolean);
  const total = totalMinutes({ durationMin: minutes, extraTime: extra });

  const load = async (file) => {
    if (!file) return;
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    try {
      const r = await fileToText(file);
      if (r.scanned) {
        setStatus(`${file.name} looks like a scanned paper (photos of pages), so it has no text to read. Please use a PDF made from a typed document, or type the questions below.`);
      } else {
        const p = parsePaper(r.text);
        setText(r.text);
        if (!title && p.title) setTitle(p.title);
        if (!Number(minutes) && p.minutes) setMinutes(p.minutes);
        setStatus(`Read ${r.pages} ${r.pages === 1 ? 'page' : 'pages'}: found ${p.questions.length} questions${p.minutes ? ` and a time of ${p.minutes} minutes` : ''}. Check them below, fix anything in the text box, then save.`);
      }
    } catch (e) {
      setStatus(e?.message || 'This file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const save = (list) => {
    const changing = JSON.stringify(list) !== JSON.stringify(custom || []);
    if (changing && hasAnswers && !window.confirm('Changing the questions deletes the current answers and the activity log. Continue?')) return;
    engine.applySetup({ title, questions: list, durationMin: minutes, extraTime: extra, lang: lang || null });
    setStatus(list.length ? `Saved: ${list.length} questions${total ? `, ${total} minutes` : ''}.` : `Saved: built-in ${DEFAULT_SETUP.title.toLowerCase()}.`);
  };

  return (
    <form
      className="teacher"
      onSubmit={(e) => {
        e.preventDefault();
        save(qs);
      }}
    >
      <p className="muted">
        For homework, class tests or revision. Upload the question paper or type it. Students answer every question by voice: written questions are dictated, and multiple-choice questions are answered by picking and then locking an option.
      </p>

      <div
        className={`drop ${drag ? 'is-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          load(e.dataTransfer.files?.[0]);
        }}
      >
        <Upload size={28} />
        <div>
          <p className="drop-title">Upload question paper</p>
          <p className="muted small">PDF with selectable text, or a .txt file. It is read on this device and never uploaded.</p>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Reading…' : 'Choose file'}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden onChange={(e) => load(e.target.files?.[0])} />
      </div>

      <div className="field-row">
        <label className="field grow">
          <span>Paper title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Class 8 Science – Unit test 2" />
        </label>
        <label className="field">
          <span>Time (minutes, 0 = none)</span>
          <input type="number" min={0} max={300} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />
        <span>
          Add compensatory time: {COMPENSATORY_MIN_PER_HOUR} minutes per hour (at least 5, in multiples of 5), as in the Government of India guidelines for candidates with disabilities
          {Number(minutes) > 0 && extra ? ` (${compensatoryMinutes(minutes)} extra, ${total} minutes in all)` : ''}
        </span>
      </label>
      <label className="field inline">
        <span>Exam language (medium)</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="">Student chooses at the start</option>
          {ANSWER_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.en} (fixed for this paper{LANGS.includes(l.code) ? '' : '; the app speaks English'})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Questions (numbered; options as (a) (b) (c) (d); marks as [2 marks])</span>
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1. What is friction? [2 marks]\n2. Which of these is a lubricant?\n(a) Sand (b) Oil (c) Water (d) Glass'} />
      </label>

      {qs.length > 0 && (
        <div className="preview" aria-live="polite">
          <p className="preview-head">
            Understood <strong>{qs.length}</strong> questions: {qs.length - mcqs} written, {mcqs} multiple choice
          </p>
          <ol>
            {qs.map((q, i) => (
              <li key={i}>
                <span className={`chip ${q.type === 'mcq' ? 'chip-mcq' : ''}`}>{q.type === 'mcq' ? `MCQ · ${q.options.length}` : 'Written'}</span>
                {q.marks ? <span className="chip">{q.marks} m</span> : null} {q.text}
                {q.options && <span className="preview-opts">{q.options.map((o, k) => `${OPTION_LETTERS[k]}. ${o}`).join('  ·  ')}</span>}
              </li>
            ))}
          </ol>
          {parsed.warnings.map((w) => (
            <p key={w} className="muted small">⚠ {w}</p>
          ))}
        </div>
      )}

      <div className="row">
        <button type="submit" className="btn primary" disabled={!qs.length && !custom && Number(minutes) === (s.setup.durationMin || 0) && extra === (s.setup.extraTime !== false) && lang === (s.setup.lang || '')}>
          {qs.length ? `Save ${qs.length} questions` : 'Save settings'}
        </button>
        {custom && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setText('');
              setTitle('');
              save([]);
            }}
          >
            Use the built-in practice paper
          </button>
        )}
      </div>
      <p role="status" className="muted small">{status}</p>
    </form>
  );
}

/**
 * Exam readiness: what an exam centre checks the day before. CBSE allows a computer for blind
 * candidates only without internet, so speech recognition must be able to run on the device.
 * Chrome can download on-device speech recognition for some languages.
 */
export function ExamReadiness({ engine, s }) {
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState('');
  const check = async () => {
    setBusy('check');
    const out = {};
    for (const l of LANGS) out[l] = await onDeviceStatus(l);
    setStatus(out);
    setBusy('');
  };
  const install = async (l) => {
    setBusy(l);
    const ok = await installOnDevice(l);
    setStatus((st) => ({ ...st, [l]: ok ? 'available' : st[l] }));
    setBusy('');
  };
  const LABEL = {
    available: 'Installed. Works without internet.',
    downloadable: 'Not installed yet. Can be downloaded.',
    downloading: 'Downloading…',
    unavailable: 'Not offered by this browser for this language. Needs internet.',
    unsupported: 'This browser has no offline speech recognition. Needs internet.',
  };
  return (
    <div className="readiness">
      <p className="muted small">
        Check this the day before, as exam centres do. School boards such as CBSE let blind candidates use a computer only without internet. Offline speech recognition keeps all audio on this computer.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={check} disabled={!!busy}>
          {busy === 'check' ? 'Checking…' : 'Check offline speech'}
        </button>
      </div>
      {Object.keys(status).length > 0 && (
        <ul className="readiness-list">
          {LANGS.map((l) => (
            <li key={l}>
              <strong>{LANG_NAMES[l].en}:</strong> {LABEL[status[l]] || status[l]}
              {status[l] === 'downloadable' && (
                <button type="button" className="btn small" disabled={!!busy} onClick={() => install(l)}>
                  {busy === l ? 'Installing…' : 'Install'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <label className="check">
        <input type="checkbox" checked={!!s.settings.onDevice} onChange={(e) => engine.updateSettings({ onDevice: e.target.checked })} />
        <span>Offline mode: recognise speech on this computer only (no internet; audio never leaves the device)</span>
      </label>
    </div>
  );
}
