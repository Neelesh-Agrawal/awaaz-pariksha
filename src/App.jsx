import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ExamEngine, MODE, totalMinutes, compensatoryMinutes } from './lib/engine.js';
import { getSentences, paragraphs, wordsOf } from './lib/sentences.js';
import { ui, LANGS, LANG_NAMES, ANSWER_LANGS } from './i18n.js';
import { OPTION_LETTERS } from './data/questions.js';
import { VoiceOrb } from './components/VoiceOrb.jsx';
import { TeacherSetup, ExamReadiness } from './components/TeacherSetup.jsx';
import { Clock, Flag, Lock, Unlock, Check, Mic } from './components/Icons.jsx';

const engine = new ExamEngine();
if (typeof window !== 'undefined') window.__awaaz = engine; // handy for debugging in DevTools

const SHORTCUTS = {
  S: { type: 'START_ANSWER' },
  X: { type: 'STOP_ANSWER' },
  P: { type: 'PAUSE' },
  R: { type: 'REPEAT_QUESTION' },
  A: { type: 'READ_ANSWER' },
  E: { type: 'EDIT_ANSWER' },
  N: { type: 'NEXT' },
  B: { type: 'PREV' },
  Y: { type: 'CONFIRM' },
  C: { type: 'CONTINUE' },
  K: { type: 'KEEP' },
  T: { type: 'TRY_AGAIN' },
  U: { type: 'UNDO' },
  H: { type: 'HELP' },
  L: { type: 'REPEAT' },
  Q: { type: 'SUBMIT' },
  M: { type: 'REMAINING' },
  W: { type: 'WHERE_AM_I' },
  O: { type: 'TIME_LEFT' },
  I: { type: 'READ_OPTIONS' },
  G: { type: 'THINK' },
  V: { type: 'MARK_REVIEW' },
};
const keyFor = (type) => Object.entries(SHORTCUTS).find(([, c]) => c.type === type)?.[0];
const isControl = (el) => !!el?.closest?.('button, a, input, select, textarea, summary, label, [role="button"], .teacher-home');
const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

function useEngine() {
  return useSyncExternalStore(engine.subscribe, engine.getState);
}

function Btn({ cmd, label, variant, disabled, onClick, btnRef, icon }) {
  const k = cmd && !cmd.n && keyFor(cmd.type);
  return (
    <button
      ref={btnRef}
      type="button"
      className={`btn ${variant || ''}`}
      disabled={disabled}
      aria-keyshortcuts={k ? `Alt+Shift+${k}` : undefined}
      onClick={onClick || (() => engine.command(cmd))}
    >
      {icon}
      <span>{label}</span>
      {k && <kbd aria-hidden="true">⌥⇧{k}</kbd>}
    </button>
  );
}

function LiveRegions({ s }) {
  const politeRef = useRef(null);
  const alertRef = useRef(null);
  useEffect(() => {
    if (!politeRef.current || !s.announcement.text) return undefined;
    politeRef.current.textContent = '';
    const t = setTimeout(() => (politeRef.current.textContent = s.announcement.text), 60);
    return () => clearTimeout(t);
  }, [s.announcement.id]);
  useEffect(() => {
    if (!alertRef.current || !s.alert.text) return undefined;
    alertRef.current.textContent = '';
    const t = setTimeout(() => (alertRef.current.textContent = s.alert.text), 60);
    return () => clearTimeout(t);
  }, [s.alert.id]);
  return (
    <>
      <div ref={politeRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <div ref={alertRef} className="sr-only" role="alert" aria-live="assertive" aria-atomic="true" />
    </>
  );
}

/** What the student is doing right now, as one state an invigilator can read at a glance. */
function stageState(s, eff) {
  if (s.micProblem) return 'problem';
  if (s.mode === MODE.IDLE) return 'off';
  if (s.instructing) return 'instructing';
  if (s.mode === MODE.SPEAKING) return 'speaking';
  if (eff === MODE.SUBMITTED) return 'submitted';
  if (eff === MODE.CONFIRMING) return 'waiting';
  const quiet = s.now - Math.max(s.listenSince || 0, s.heardAt || 0) > 5000 && !s.interim;
  if (eff === MODE.DICTATING) return s.paused ? 'paused' : s.thinking || quiet ? 'recording-quiet' : 'recording';
  if (eff === MODE.EDIT_COMMAND) return 'editing';
  return s.thinking || quiet ? 'thinking' : 'listening';
}

function sayNow(s, t, eff, mcq) {
  if (!s.lang) return t.sayNow.language;
  if (s.instructing) return t.sayNow.instructing;
  if (!s.started) return t.sayNow.start;
  switch (eff) {
    case MODE.DICTATING:
      if (s.dictTarget?.kind && s.dictTarget.kind !== 'answer') return t.sayNow.replace;
      return s.paused ? t.sayNow.paused : t.sayNow.dictation;
    case MODE.CONFIRMING:
      return t.sayNow.confirm;
    case MODE.EDIT_COMMAND:
      return t.sayNow.edit;
    case MODE.SUBMITTED:
      return t.sayNow.submitted;
    default:
      return mcq ? t.sayNow.mcq : t.sayNow.command;
  }
}

export default function App() {
  const s = useEngine();
  const t = useMemo(() => ui(s.lang || 'en-IN'), [s.lang]);
  const eff = s.mode === MODE.SPEAKING ? s.nextMode : s.mode;
  const lang = s.lang || 'en-IN';
  const secsLeft = s.timerEndsAt && !s.submitted ? Math.max(0, Math.ceil((s.timerEndsAt - s.now) / 1000)) : null;

  const stageRef = useRef(null);
  const confirmFirstRef = useRef(null);
  const resultsHeadingRef = useRef(null);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (s.printTarget) document.documentElement.dataset.print = s.printTarget;
    else delete document.documentElement.dataset.print;
  }, [s.printTarget]);
  useEffect(() => {
    if (s.booted) stageRef.current?.focus();
  }, [s.booted]);
  useEffect(() => {
    if (s.confirm?.kind) setTimeout(() => confirmFirstRef.current?.focus(), 0);
  }, [s.confirm?.kind, s.confirm?.prompt]);
  useEffect(() => {
    if (s.submitted && s.booted) setTimeout(() => resultsHeadingRef.current?.focus(), 0);
  }, [s.submitted]);
  useEffect(() => {
    // Kiosk / exam-centre setups can open the page with ?autostart=1 (needs a browser that allows autoplay).
    if (new URLSearchParams(window.location.search).has('autostart')) engine.begin();
  }, []);

  useEffect(() => {
    const IGNORE = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock']);
    const onKey = (e) => {
      // Before starting, any key starts the app – the student does not have to find a button.
      if (!engine.state.booted) {
        if (IGNORE.has(e.key) || e.ctrlKey || e.metaKey || e.target.closest?.('.teacher-home')) return;
        e.preventDefault();
        engine.begin();
        return;
      }
      if (e.key === 'Escape' && engine.state.mode === MODE.SPEAKING) {
        e.preventDefault();
        engine.command({ type: 'STOP_SPEAKING' });
        return;
      }
      // Space (when not on a control or a text field) = "I want to give an instruction".
      if (e.code === 'Space' && !e.altKey && !e.ctrlKey && !e.metaKey && !isControl(e.target)) {
        e.preventDefault();
        engine.wake('space');
        return;
      }
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
      const digit = e.code?.match(/^Digit([1-6])$/);
      if (digit && engine.isMcq()) {
        e.preventDefault();
        engine.command({ type: 'SELECT_OPTION', n: Number(digit[1]) });
        return;
      }
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.code.replace('Key', '');
      const cmd = SHORTCUTS[k];
      if (cmd) {
        e.preventDefault();
        engine.command(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!s.booted) return <Home s={s} />;

  const mcq = s.started && engine.isMcq(s.current);
  const state = stageState(s, eff);
  return (
    <>
      <LiveRegions s={s} />
      <div
        className={`app state-${state}`}
        onClick={(e) => {
          // A tap anywhere that is not a control = "I want to give an instruction".
          if (!isControl(e.target) && !e.target.closest('.more, .print-root')) engine.wake('tap');
        }}
      >
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">{t.title}</span>
            <span className="brand-paper">{s.setup.title}</span>
          </div>
          <div className="topbar-right">
            {secsLeft !== null && (
              <p className={`timer ${secsLeft <= 300 ? 'warn' : ''} ${secsLeft <= 60 ? 'urgent' : ''}`} role="timer" aria-label={`${t.timeLeft}: ${fmtTime(secsLeft)}`}>
                <Clock size={18} /> {fmtTime(secsLeft)}
              </p>
            )}
            <label className="answer-lang">
              <span>{t.answerIn}</span>
              <select
                value={s.answerLang || s.lang || 'en-IN'}
                disabled={eff === MODE.DICTATING || eff === MODE.CONFIRMING || !!s.setup.lang}
                onChange={(e) => engine.selectAnswerLanguage(e.target.value)}
              >
                {ANSWER_LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native === l.en ? l.en : `${l.native} · ${l.en}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="seg" role="group" aria-label={t.talkIn}>
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  lang={l}
                  aria-pressed={s.lang === l}
                  disabled={eff === MODE.DICTATING || eff === MODE.CONFIRMING}
                  onClick={() => engine.command({ type: 'SELECT_LANGUAGE', lang: l })}
                >
                  {LANG_NAMES[l].native}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="layout">
          <main id="main" className="main-col">
            <Stage s={s} t={t} eff={eff} state={state} mcq={mcq} stageRef={stageRef} />
            {s.started && <QuestionCard s={s} t={t} eff={eff} lang={lang} />}
            <section className="controls" aria-label="Controls">
              <Controls s={s} t={t} eff={eff} mcq={mcq} confirmFirstRef={confirmFirstRef} />
            </section>
            {s.submitted && <Results s={s} t={t} headingRef={resultsHeadingRef} />}
          </main>
          {s.started && (
            <aside className="side-col">
              <Palette s={s} t={t} eff={eff} />
            </aside>
          )}
        </div>

        <More s={s} t={t} />
      </div>

      <div className="print-root" aria-hidden="true">
        <div className="print-answers">
          <AnswerSheet s={s} id="sheet-print" />
        </div>
        <div className="print-log">
          <PrintableLog s={s} />
        </div>
      </div>
    </>
  );
}

// ---------------- Home ----------------
function Home({ s }) {
  const unsupported = !engine.io.support.recognition;
  const count = engine.count;
  const mcqs = engine.questions.filter((_, i) => engine.isMcq(i)).length;
  const mins = totalMinutes(s.setup);
  const extra = s.setup.extraTime && s.setup.durationMin ? compensatoryMinutes(s.setup.durationMin) : 0;
  return (
    <>
      <LiveRegions s={s} />
      <main
        className="home"
        id="main"
        onClick={(e) => {
          // A tap anywhere (phone) starts too, except inside the teacher setup.
          if (!e.target.closest('.teacher-home')) engine.begin();
        }}
      >
        <header className="home-top">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Awaaz Pariksha</span>
          <span className="home-names">
            <span lang="hi-IN">आवाज़ परीक्षा</span>
            <span lang="ta-IN">ஆவாஸ் பரீக்ஷா</span>
          </span>
        </header>

        <section className="slip" aria-labelledby="slip-title">
          <p className="slip-kicker">{s.setup.questions ? 'Question paper' : 'Practice paper'}</p>
          <h1 id="slip-title" className="slip-title">
            {s.setup.title}
          </h1>
          <dl className="slip-meta">
            <div>
              <dt>Questions</dt>
              <dd>
                {count}
                {mcqs > 0 && <span className="slip-sub"> ({count - mcqs} written, {mcqs} multiple choice)</span>}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                {mins ? `${mins} min` : 'No limit'}
                {extra ? <span className="slip-sub"> (includes {extra} min extra time)</span> : null}
              </dd>
            </div>
          </dl>
          <button type="button" className="start-btn" autoFocus aria-describedby="start-how">
            <Mic size={26} />
            <span>{s.hasSaved ? 'Continue' : 'Start'}</span>
          </button>
          <p className="slip-how" id="start-how">
            Press any key or tap anywhere to begin. The app reads each question aloud, then listens. Later, to give an instruction, tap anywhere, press Space, or say “Awaaz”.
          </p>
        </section>

        {unsupported && (
          <p className="problem" role="alert">
            This browser cannot recognise speech. Please open Awaaz Pariksha in Google Chrome or Safari.
          </p>
        )}

        <details className="teacher-home">
          <summary>For teachers and parents: set a question paper</summary>
          <TeacherSetup engine={engine} s={s} />
          <h2 className="sub-h">Exam readiness: offline speech</h2>
          <ExamReadiness engine={engine} s={s} />
        </details>
        <p className="home-note">Practice prototype. Not an official examination platform.</p>
      </main>
    </>
  );
}

// ---------------- Status ----------------
function Stage({ s, t, eff, state, mcq, stageRef }) {
  const label =
    state === 'problem' ? s.micProblem?.text
      : state === 'recording' ? t.banner.recording(s.current + 1).split(' – ')[0]
        : t.orb[state === 'recording-quiet' ? 'thinking' : state];
  // Silent while recording = thinking; say so, but keep it clear that the microphone is still on.
  const rec = state === 'recording' || state === 'recording-quiet';
  const understood = s.understood === '—' ? 'Not understood' : s.understood === '…' ? 'Thinking sound, ignored' : s.understood;
  return (
    <section className={`status is-${state}`} aria-labelledby="stage-h">
      <div className="status-row">
        <VoiceOrb state={state} />
        <div className="status-main">
          <h1 id="stage-h" ref={stageRef} tabIndex={-1} className="status-title">
            {label}
            {rec && <span className="rec-tag"><span className="rec-dot" aria-hidden="true" />REC</span>}
          </h1>
          {state === 'recording-quiet' && <p className="status-detail">{t.orb.recording}</p>}
          <p className="status-say" lang={s.lang || undefined}>
            {sayNow(s, t, eff, mcq)}
          </p>
        </div>
        {s.lang && !s.submitted && (
          <button type="button" className={`instr-key ${s.instructing ? 'on' : ''}`} onClick={() => engine.wake('button')}>
            <kbd aria-hidden="true">Space</kbd>
            <span>{s.instructing ? t.orb.instructing : t.giveInstruction}</span>
          </button>
        )}
      </div>
      {s.micProblem && s.micProblem.code !== 'unsupported' && (
        <div className="row">
          <Btn label={t.retryMic} variant="primary" onClick={() => engine.retryMic()} />
        </div>
      )}
      {s.voiceWarning && <p className="status-note">{s.voiceWarning}</p>}
      <dl className="transcript">
        <div>
          <dt>App</dt>
          <dd lang={s.lang || undefined}>{s.prompt || '—'}</dd>
        </div>
        <div>
          <dt>{t.youSaid}</dt>
          <dd className={s.interim ? 'interim' : ''}>
            {s.interim || s.lastHeard || t.heardNothing}
            {understood && !s.interim && <span className="understood" lang="en-IN"> → {understood}</span>}
          </dd>
        </div>
      </dl>
    </section>
  );
}

// ---------------- Question ----------------
function statusLabel(t, st) {
  return { notVisited: t.legend.notVisited, notAnswered: t.legend.notAnswered, answered: t.legend.answered, picked: t.legend.picked }[st];
}

function QuestionCard({ s, t, eff, lang }) {
  const i = s.current;
  const q = engine.questions[i] || {};
  const mcq = engine.isMcq(i);
  const st = engine.status(i);
  const marked = s.review[i];
  return (
    <section className="page" aria-labelledby="q-h">
      <div className="page-margin" aria-hidden="true">
        {i + 1}
      </div>
      <div className="page-body">
        <div className="q-meta">
          <h2 id="q-h">
            {t.question} {i + 1} {t.of} {engine.count}
          </h2>
          <span className="q-facts">
            {mcq ? t.typeMcq : t.typeText}
            {q.marks ? ` · ${t.marks(q.marks)}` : ''}
            {' · '}
            <span className={`q-status st-${st}`}>{statusLabel(t, st)}</span>
          </span>
          <button
            type="button"
            className={`flag-btn ${marked ? 'on' : ''}`}
            aria-pressed={marked}
            disabled={s.submitted}
            onClick={() => engine.command({ type: marked ? 'UNMARK_REVIEW' : 'MARK_REVIEW' })}
          >
            <Flag size={16} /> {marked ? t.legend.review : t.markReview}
          </button>
        </div>
        <p className="qtext" lang={q[lang] ? lang : undefined}>
          {engine.qText(i, lang)}
        </p>
        {lang !== 'en-IN' && q['en-IN'] && (
          <p className="qtext-en" lang="en-IN">
            {q['en-IN']}
          </p>
        )}
        {mcq ? <Options s={s} t={t} lang={lang} /> : <WrittenAnswer s={s} t={t} eff={eff} />}
      </div>
    </section>
  );
}

function Options({ s, t, lang }) {
  const i = s.current;
  const opts = engine.optionTexts(i, lang);
  const en = engine.optionTexts(i, 'en-IN');
  const c = s.choices[i];
  const locked = !!c?.locked;
  return (
    <>
      <ol className={`options ${locked ? 'has-locked' : ''}`} aria-label={t.typeMcq}>
        {opts.map((o, k) => {
          const picked = c && c.sel === k;
          const cls = picked ? (locked ? 'is-locked' : 'is-picked') : s.optionCursor === k ? 'is-reading' : '';
          return (
            <li key={k} className={`option ${cls}`}>
              <button
                type="button"
                className="option-btn"
                aria-pressed={!!picked}
                disabled={s.submitted || (locked && !picked)}
                onClick={() => engine.command({ type: 'SELECT_OPTION', n: k + 1 })}
              >
                <span className="opt-letter" aria-hidden="true">
                  {picked && locked ? <Check size={18} /> : OPTION_LETTERS[k]}
                </span>
                <span className="opt-text">
                  <span className="sr-only">
                    {t.option} {OPTION_LETTERS[k]}:{' '}
                  </span>
                  {o}
                  {lang !== 'en-IN' && en[k] && en[k] !== o && <span className="opt-en"> · {en[k]}</span>}
                </span>
                {picked && (
                  <span className={`opt-tag ${locked ? 'locked' : 'picked'}`}>
                    {locked ? <Lock size={14} /> : null} {locked ? t.lockedTag : t.pickedTag}
                  </span>
                )}
                {!picked && s.optionCursor === k && <span className="opt-tag reading">{t.readingTag}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function WrittenAnswer({ s, t, eff }) {
  const sentences = getSentences(s.answers[s.current]);
  return (
    <div className="answer">
      <h3 className="answer-h">{t.yourAnswer}</h3>
      {sentences.length ? (
        (eff === MODE.EDIT_COMMAND || (s.cursor !== null && s.edit)) && !s.submitted ? (
          <ol className="editor">
            {sentences.map((sen, i) => {
              const current = i === (s.cursor ?? 0);
              return (
                <li key={i} className={current ? 'current' : ''} aria-current={current ? 'true' : undefined}>
                  <button type="button" className="sen-pick" onClick={() => engine.command({ type: 'GOTO_SENTENCE', n: i + 1 })}>
                    <span className="sen-label">{i + 1}</span>
                    {current ? (
                      <span className="sen-words">
                        {wordsOf(sen).map((w, wi) => (
                          <span key={wi} className="word">
                            <sup>{wi + 1}</sup>
                            {w}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="sen-text">{sen}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="answer-prose">
            {paragraphs(s.answers[s.current]).map((para, pi) => (
              <p key={pi}>
                {para.map(({ n, text }) => (
                  <span key={n} className={`sen ${s.edit?.op && s.edit.index === n - 1 ? 'editing' : ''}`}>
                    <sup className="sen-num" aria-label={`${t.sentence} ${n}`}>
                      {n}
                    </sup>
                    {text}{' '}
                  </span>
                ))}
                {pi === paragraphs(s.answers[s.current]).length - 1 && eff === MODE.DICTATING && !s.paused && <span className="caret" aria-hidden="true" />}
              </p>
            ))}
          </div>
        )
      ) : (
        <p className="empty">{eff === MODE.DICTATING && !s.paused ? <span className="caret" aria-hidden="true" /> : t.noAnswer}</p>
      )}
      {s.interim && eff === MODE.DICTATING && <p className="interim-line">{s.interim}</p>}
      {s.pending && (
        <p className="pending">
          <strong>{t.pending}:</strong> “{s.pending.text}”
        </p>
      )}
      {s.edit?.proposed && s.confirm?.kind === 'edit' && (
        <p className="pending">
          <strong>{t.proposed}:</strong> “{s.edit.proposed}”
        </p>
      )}
    </div>
  );
}

// ---------------- Palette ----------------
function Palette({ s, t, eff }) {
  const { answered, picks } = engine.counts();
  const busy = eff === MODE.DICTATING || eff === MODE.CONFIRMING;
  return (
    <nav className="palette" aria-label={t.palette}>
      <div className="palette-head">
        <h2>{t.palette}</h2>
        <p className="palette-count">
          {answered - picks.length} {t.of} {engine.count} {t.answered.toLowerCase()}
          {picks.length ? ` · ${picks.length} ${t.legend.picked.toLowerCase()}` : ''}
        </p>
      </div>
      <ul className="tiles">
        {s.answers.map((_, i) => {
          const st = engine.status(i);
          const c = s.choices[i];
          return (
            <li key={i}>
              <button
                type="button"
                className={`tile st-${st} ${s.review[i] ? 'review' : ''} ${i === s.current ? 'current' : ''}`}
                aria-current={i === s.current ? 'step' : undefined}
                aria-label={`${t.question} ${i + 1}: ${statusLabel(t, st)}${s.review[i] ? `, ${t.legend.review}` : ''}`}
                disabled={busy}
                onClick={() => engine.command({ type: 'GOTO', n: i + 1 })}
              >
                <span>{i + 1}</span>
                {engine.isMcq(i) && c && c.sel !== null && <small aria-hidden="true">{OPTION_LETTERS[c.sel]}</small>}
              </button>
            </li>
          );
        })}
      </ul>
      <ul className="legend" aria-label="Legend">
        {['notVisited', 'notAnswered', 'answered', 'picked', 'review'].map((k) => (
          <li key={k}>
            <span className={`sw sw-${k}`} aria-hidden="true" />
            {t.legend[k]}
          </li>
        ))}
      </ul>
      {!s.submitted && <Btn label={t.submit} variant="submit" cmd={{ type: 'SUBMIT' }} disabled={busy} />}
    </nav>
  );
}

// ---------------- Controls ----------------
function Controls({ s, t, eff, mcq, confirmFirstRef }) {
  const speaking = s.mode === MODE.SPEAKING;
  const skip = speaking && (
    <div className="row">
      <Btn label={`${t.stopSpeaking} (Esc)`} variant="quiet" onClick={() => engine.command({ type: 'STOP_SPEAKING' })} />
    </div>
  );
  const more = (extra = []) => (
    <details className="more-actions">
      <summary>{t.moreActions}</summary>
      <div className="row">
        {extra}
        <Btn label={t.giveTime} cmd={{ type: 'THINK' }} />
        {s.started && <Btn label={t.whereAmI} cmd={{ type: 'WHERE_AM_I' }} />}
        <Btn label={t.help} cmd={{ type: 'HELP' }} />
        <Btn label={t.repeatPrompt} cmd={{ type: 'REPEAT' }} />
        <Btn label={t.slower} cmd={{ type: 'SLOWER' }} />
        <Btn label={t.faster} cmd={{ type: 'FASTER' }} />
      </div>
    </details>
  );

  if (!s.lang) {
    return (
      <>
        {skip}
        <div className="row" role="group" aria-label={t.chooseLanguage}>
          {LANGS.map((l) => (
            <button key={l} type="button" lang={l} className="btn primary big" onClick={() => engine.command({ type: 'SELECT_LANGUAGE', lang: l })}>
              {LANG_NAMES[l].native}
            </button>
          ))}
        </div>
      </>
    );
  }
  if (!s.started) {
    return (
      <>
        {skip}
        <div className="row">
          <Btn label={t.startExam} variant="primary big" cmd={{ type: 'START_EXAM' }} />
        </div>
        {more()}
      </>
    );
  }
  if (eff === MODE.CONFIRMING && s.confirm) {
    const sets = {
      stop: [[t.confirm, 'CONFIRM', 'primary'], [t.continue, 'CONTINUE'], [t.thatWasMyAnswer, 'THAT_WAS_MY_ANSWER']],
      lowconf: [[t.keep, 'KEEP', 'primary'], [t.repeatChunk, 'TRY_AGAIN']],
      edit: [[t.confirmChange, 'CONFIRM', 'primary'], [t.tryAgain, 'TRY_AGAIN'], [t.cancel, 'DONE']],
      submit: [[t.confirmSubmission, 'CONFIRM', 'danger-solid'], [t.continueExam, 'CONTINUE']],
    }[s.confirm.kind];
    return (
      <>
        {skip}
        <div className="confirm-box" role="group" aria-labelledby="confirm-q">
          <p id="confirm-q" className="confirm-q" lang={s.lang}>
            {s.confirm.prompt}
          </p>
          <div className="row">
            {sets.map(([label, type, variant], i) => (
              <Btn key={type} label={label} variant={`big ${variant || ''}`} cmd={{ type }} btnRef={i === 0 ? confirmFirstRef : undefined} />
            ))}
          </div>
        </div>
      </>
    );
  }
  if (eff === MODE.DICTATING) {
    const target = s.dictTarget?.kind || 'answer';
    return (
      <>
        {skip}
        {target === 'answer' ? (
          <div className="row" role="group" aria-label={t.answerControls}>
            <Btn label={t.stopAnswer} variant="big rec" cmd={{ type: 'STOP_ANSWER' }} />
            <Btn label={t.readAnswer} variant="big" cmd={{ type: 'READ_ANSWER' }} />
            <Btn label={t.undo} variant="big" cmd={{ type: 'UNDO' }} />
          </div>
        ) : (
          <div className="row" role="group" aria-label={t.editControls}>
            <Btn label={t.cancel} variant="big" cmd={{ type: 'DONE' }} />
          </div>
        )}
      </>
    );
  }
  if (eff === MODE.EDIT_COMMAND) {
    // Editing is done by saying what to change; the buttons only cover what is needed by touch.
    return (
      <>
        {skip}
        <div className="row" role="group" aria-label={t.editControls}>
          <Btn label={t.readAnswer} variant="big" cmd={{ type: 'READ_ANSWER' }} />
          <Btn label={t.undo} variant="big" cmd={{ type: 'UNDO' }} />
          <Btn label={t.done} variant="primary big" cmd={{ type: 'DONE' }} />
        </div>
      </>
    );
  }
  if (eff === MODE.SUBMITTED) {
    return (
      <>
        {skip}
        <div className="row" role="group" aria-label={t.readAnswerN}>
          {s.answers.map((_, i) => (
            <Btn key={i} label={`${t.readAnswerN} ${i + 1}`} cmd={{ type: 'READ_ANSWER', n: i + 1 }} />
          ))}
        </div>
      </>
    );
  }
  if (mcq) {
    const c = s.choices[s.current];
    const picked = c && c.sel !== null;
    return (
      <>
        {skip}
        <div className="row" role="group" aria-label={t.answerControls}>
          <Btn label={t.readOptions} variant="big" cmd={{ type: 'READ_OPTIONS' }} />
          {c?.locked ? (
            <Btn label={t.unlockChoice} variant="big" icon={<Unlock size={18} />} cmd={{ type: 'UNLOCK_CHOICE' }} />
          ) : (
            <Btn label={t.lockChoice} variant="primary big" icon={<Lock size={18} />} cmd={{ type: 'LOCK_CHOICE' }} disabled={!picked} />
          )}
          <Btn label={t.next} variant="big" cmd={{ type: 'NEXT' }} />
        </div>
        {more([
          <Btn key="rq" label={t.repeatQuestion} cmd={{ type: 'REPEAT_QUESTION' }} />,
          <Btn key="clr" label={t.clearChoice} cmd={{ type: 'CLEAR_CHOICE' }} disabled={!picked || c?.locked} />,
          <Btn key="prev" label={t.prev} cmd={{ type: 'PREV' }} />,
          <Btn key="rem" label={t.remaining} cmd={{ type: 'REMAINING' }} />,
        ])}
      </>
    );
  }
  const hasAnswer = getSentences(s.answers[s.current]).length > 0;
  return (
    <>
      {skip}
      <div className="row" role="group" aria-label={t.answerControls}>
        <Btn label={t.startAnswer} variant="primary big" icon={<Mic size={18} />} cmd={{ type: 'START_ANSWER' }} />
        {hasAnswer && <Btn label={t.readAnswer} variant="big" cmd={{ type: 'READ_ANSWER' }} />}
        {hasAnswer && <Btn label={t.editAnswer} variant="big" cmd={{ type: 'EDIT_ANSWER' }} />}
        <Btn label={t.next} variant="big" cmd={{ type: 'NEXT' }} />
      </div>
      {more([
        <Btn key="rq" label={t.repeatQuestion} cmd={{ type: 'REPEAT_QUESTION' }} />,
        <Btn key="prev" label={t.prev} cmd={{ type: 'PREV' }} />,
        <Btn key="rem" label={t.remaining} cmd={{ type: 'REMAINING' }} />,
        <Btn key="undo" label={t.undo} cmd={{ type: 'UNDO' }} />,
      ])}
    </>
  );
}

// ---------------- After submission ----------------
function Results({ s, t, headingRef }) {
  return (
    <section className="results" aria-labelledby="results-h">
      <h2 id="results-h" ref={headingRef} tabIndex={-1}>
        {t.submittedHeading}
      </h2>
      <p>
        Press <strong>{t.printSheet}</strong>, then choose “Save as PDF” in Chrome’s print dialog. The print dialog is part of the browser and is not voice controlled.
      </p>
      <div className="row">
        <Btn label={t.printSheet} variant="primary big" onClick={() => engine.printNow('answers')} />
        <Btn label={t.printLog} onClick={() => engine.printNow('log')} />
      </div>
      <details>
        <summary>{t.previewSheet}</summary>
        <AnswerSheet s={s} id="sheet-preview" />
      </details>
    </section>
  );
}

function More({ s, t }) {
  return (
    <details className="more">
      <summary>{t.more}</summary>
      <div className="more-grid">
        <HelpPanel t={t} />
        <Settings s={s} t={t} />
        <section aria-labelledby="test-h">
          <h2 id="test-h">{t.testControls}</h2>
          <div className="row">
            <Btn label={t.simulateError} onClick={() => engine.command({ type: 'SIMULATE_ERROR' })} />
            <label className="check">
              <input type="checkbox" checked={s.simulateLowConf} onChange={() => engine.toggleLowConf()} /> {t.simulateLowConf}
            </label>
          </div>
        </section>
        <section aria-labelledby="teacher-h">
          <h2 id="teacher-h">Teacher or parent: question paper</h2>
          <TeacherSetup engine={engine} s={s} />
        </section>
        <section aria-labelledby="ready-h">
          <h2 id="ready-h">Exam readiness: offline speech</h2>
          <ExamReadiness engine={engine} s={s} />
        </section>
        <section aria-labelledby="log-h">
          <h2 id="log-h">Activity log ({s.log.length})</h2>
          <ActivityLog s={s} />
        </section>
        <Diagnostics s={s} />
      </div>
    </details>
  );
}

function AnswerSheet({ s, id }) {
  const lang = s.lang || 'en-IN';
  return (
    <article className="answer-sheet" id={id} lang={lang}>
      <header>
        <h2 className="sheet-title">Awaaz Pariksha — {s.setup.title}</h2>
        <p className="sheet-disclaimer">Practice prototype only. Not an officially approved examination platform.</p>
        <dl className="sheet-meta">
          <div><dt>Language</dt><dd>{LANG_NAMES[lang].en} ({LANG_NAMES[lang].native})</dd></div>
          <div><dt>Submitted</dt><dd>{s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-IN') : 'Not yet submitted'}</dd></div>
          <div><dt>Student name</dt><dd className="blank">&nbsp;</dd></div>
          <div><dt>Roll number</dt><dd className="blank">&nbsp;</dd></div>
        </dl>
      </header>
      {engine.questions.map((q, i) => {
        const mcq = engine.isMcq(i);
        const sents = getSentences(s.answers[i]);
        const c = s.choices[i];
        return (
          <section key={i} className="sheet-q">
            <h3>
              Question {i + 1}. <span>{engine.qText(i, lang)}</span>
              {lang !== 'en-IN' && q['en-IN'] && <span className="sheet-q-en" lang="en-IN"> ({q['en-IN']})</span>}
              {q.marks ? <span className="sheet-marks"> [{q.marks}]</span> : null}
            </h3>
            {mcq ? (
              <>
                <ol className="sheet-opts" type="A">
                  {engine.optionTexts(i, lang).map((o, k) => (
                    <li key={k} className={c && c.sel === k ? 'chosen' : ''}>{o}</li>
                  ))}
                </ol>
                <p className="sheet-answer">
                  {c && c.sel !== null ? `Answer: (${OPTION_LETTERS[c.sel]}) ${engine.optionTexts(i, lang)[c.sel]}${c.locked ? '' : ' — picked, not locked'}` : '(Not answered)'}
                </p>
              </>
            ) : sents.length ? (
              <p className="sheet-answer">{sents.join(' ')}</p>
            ) : (
              <p className="sheet-answer empty">(Not answered)</p>
            )}
            <Integrity i={i} mcq={mcq} />
          </section>
        );
      })}
      <footer className="sheet-footer">
        Answers were given by the student by voice using {s.settings.onDevice ? 'on-device (offline) speech recognition' : 'browser speech recognition'} and reviewed by voice, without a human scribe. Wording is preserved exactly as recognized; it was not translated or corrected. The “Record” line under each answer comes from the timestamped activity log, which can be printed separately.
        {s.setup.durationMin ? ` Time allowed: ${s.setup.durationMin} minutes${s.setup.extraTime ? ` + ${compensatoryMinutes(s.setup.durationMin)} minutes compensatory time` : ''}.` : ''}
      </footer>
    </article>
  );
}

/** How the answer was produced, from the activity log, for the evaluator. */
function Integrity({ i, mcq }) {
  const r = engine.integrity(i);
  if (!r.first) return null;
  const t = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const parts = mcq
    ? [n(r.picks, 'pick', 'picks'), n(r.locks, 'lock', 'locks')]
    : [n(r.dictated, 'dictated part', 'dictated parts'), n(r.edits, 'voice edit', 'voice edits'), `read back ${n(r.reads, 'time', 'times')}`];
  return (
    <p className="sheet-integrity">
      Record: {parts.join(' · ')} · {t(r.first)} to {t(r.last)}
    </p>
  );
}

function describe(e) {
  const parts = [];
  for (const [k, v] of Object.entries(e)) {
    if (['ts', 'q', 'type'].includes(k) || v === null || v === undefined) continue;
    parts.push(`${k}: ${typeof v === 'string' ? `“${v}”` : v}`);
  }
  return parts.join('; ');
}

function ActivityLog({ s }) {
  if (!s.log.length) return <p>No activity yet.</p>;
  return (
    <div className="table-wrap">
      <table className="log-table">
        <caption className="sr-only">Timestamped activity log, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Q</th>
            <th scope="col">Event</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {s.log.slice().reverse().map((e, i) => (
            <tr key={i}>
              <td>{new Date(e.ts).toLocaleTimeString('en-IN')}</td>
              <td>{e.q ?? '—'}</td>
              <td>{e.type.replace(/_/g, ' ')}</td>
              <td>{describe(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintableLog({ s }) {
  return (
    <article className="answer-sheet">
      <h2 className="sheet-title">Awaaz Pariksha — Activity Log</h2>
      <p className="sheet-disclaimer">Practice prototype only. Not an officially approved examination platform. Times are local (en-IN).</p>
      <table className="log-table">
        <thead>
          <tr>
            <th>Date &amp; time</th>
            <th>Q</th>
            <th>Event</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {s.log.map((e, i) => (
            <tr key={i}>
              <td>{new Date(e.ts).toLocaleString('en-IN')}</td>
              <td>{e.q ?? '—'}</td>
              <td>{e.type.replace(/_/g, ' ')}</td>
              <td>{describe(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

const HELP_ROWS = [
  ['Give an instruction (the one thing to remember)', 'Tap anywhere, press Space, or start with “Awaaz” – then say it your way', 'कहीं भी टैप करें, Space दबाएं, या पहले “आवाज़” बोलें', 'எங்கும் தட்டுங்கள், Space, அல்லது முதலில் “ஆவாஸ்”', 'Space'],
  ['Start answer', 'Start answer / Start recording / Take my answer / I am ready', 'जवाब शुरू करो / रिकॉर्डिंग शुरू करो / मेरा जवाब लिखो', 'பதிலை தொடங்கு / ஆரம்பி / பதில் சொல்றேன்', 'S'],
  ['Stop answer', 'Stop / Stop recording / I am done / That is all / Save my answer', 'बस / बस हो गया / रिकॉर्डिंग बंद करो / जवाब पूरा हुआ', 'நிறுத்து / போதும் / முடிஞ்சது', 'X'],
  ['Pause / resume', 'Pause / Resume / Carry on', 'रुको / चालू करो / जारी रखो', 'நிறுத்தி வை / தொடர்', 'P'],
  ['Thinking time', 'Let me think / Give me time / Wait / One minute', 'सोचने दो / एक मिनट / थोड़ा समय दो', 'யோசிக்கணும் / ஒரு நிமிஷம் / இரு', 'G'],
  ['Hear the options', 'Read options / Options / What are the options', 'ऑप्शन पढ़ो / ऑप्शन बताओ', 'ஆப்ஷன்ஸ் படி', 'I'],
  ['Hear one option', 'Option B / What is option B / Next option', 'ऑप्शन B / अगला ऑप्शन', 'ஆப்ஷன் B / அடுத்த ஆப்ஷன்', '—'],
  ['Pick an option (not final)', 'Choose B / My answer is B / Select mercury / B is correct', 'B चुनो / मेरा जवाब B है / B सही है', 'B தேர்வு செய் / என் பதில் B', '1–6'],
  ['Lock the pick (final)', 'Lock it / Final answer / Confirm my answer / Lock B', 'लॉक करो / पक्का / फाइनल जवाब', 'லாக் செய் / ஃபைனல்', 'Y'],
  ['Change a locked answer', 'Unlock / Change my answer', 'अनलॉक करो', 'அன்லாக்', '—'],
  ['Mark for review', 'Mark for review / Flag this / Come back later', 'रिव्यू के लिए मार्क करो / बाद में देखेंगे', 'மார்க் செய் / அப்புறம் பார்க்கலாம்', 'V'],
  ['Punctuation', 'full stop · comma · question mark · next sentence · next paragraph', 'पूर्ण विराम · अल्पविराम · अगला वाक्य · अगला पैराग्राफ', 'முற்றுப்புள்ளி · காற்புள்ளி · அடுத்த வாக்கியம் · அடுத்த பத்தி', '—'],
  ['Restore mistaken command', 'That was my answer', 'वो मेरा जवाब था', 'அது என் பதில்', '—'],
  ['Repeat question', 'Repeat question / What was the question', 'सवाल फिर से बोलो / सवाल क्या था', 'கேள்வியை மறுபடி சொல்லு', 'R'],
  ['Read answer', 'Read my answer / What did I write', 'मेरा जवाब पढ़ो / मैंने क्या लिखा', 'என் பதிலை படி', 'A'],
  ['Edit', 'Edit answer / I want to change my answer', 'जवाब बदलो / एडिट करो', 'பதிலை திருத்து / எடிட் பண்ணு', 'E'],
  ['Move in the editor', 'Next / Previous / Next paragraph / Sentence 4', 'अगला / पिछला / अगला पैराग्राफ / वाक्य 4', 'அடுத்தது / முந்தையது / அடுத்த பத்தி / வாக்கியம் 4', '—'],
  ['Hear words with numbers', 'Read words', 'शब्द पढ़ो', 'சொற்களை படி', '—'],
  ['Fix one word', 'Change word 3 (then say the new word) / Fix sunlite', 'शब्द 3 बदलो / सूरज गलत है', 'சொல் 3 மாற்று', '—'],
  ['Delete one word', 'Delete word 3', 'शब्द 3 हटाओ', 'சொல் 3 நீக்கு', '—'],
  ['This sentence', 'Delete this / Rewrite this / Add after this', 'इसे हटाओ / इसे बदलो / इसके बाद जोड़ो', 'இதை நீக்கு / இதை மாற்று / இதன் பின் சேர்', '—'],
  ['In one breath', 'Replace the second line with … / Add after photosynthesis …', 'वाक्य 2 की जगह … लिखो', '—', '—'],
  ['Change a word to another', 'Change sunlite to sunlight', 'सूरज को सूर्य से बदलो', 'X ஐ Y ஆக மாற்று', '—'],
  ['Remove last part (while speaking)', 'Scratch that', 'अनडू करो', 'அன்டூ', '—'],
  ['Clear answer', 'Clear answer / Start over', 'सब मिटा दो', 'எல்லாம் அழி', '—'],
  ['Undo', 'Undo / Take that back', 'अनडू करो / पहले जैसा करो', 'அன்டூ', 'U'],
  ['Yes / no', 'Yes / Okay / Sure · No / Not that', 'हां / ठीक है · नहीं', 'ஆமாம் / சரி · இல்லை', 'Y / T'],
  ['Navigate', 'Next question / Skip / Previous question / Go to question 3', 'अगला सवाल / छोड़ो / पिछला सवाल / सवाल 3 पर जाओ', 'அடுத்த கேள்வி / ஸ்கிப் / கேள்வி 3க்கு போ', 'N / B'],
  ['Where am I', 'Where am I / Which question is this', 'मैं कहां हूं / कौन सा सवाल है', 'நான் எங்கே இருக்கிறேன்', 'W'],
  ['Time left', 'How much time is left', 'कितना टाइम बचा है', 'எவ்வளவு நேரம் உள்ளது', 'O'],
  ['Speech speed', 'Slower / Faster', 'धीरे बोलो / तेज़ बोलो', 'மெதுவா பேசு / வேகமாக', '—'],
  ['Questions left', 'How many questions are left', 'कितने सवाल बचे हैं', 'எத்தனை கேள்வி பாக்கி', 'M'],
  ['Submit', 'Submit / Hand in my paper', 'पेपर जमा करो / सबमिट करो', 'சமர்ப்பி / சப்மிட் பண்ணு', 'Q'],
  ['Print (after submit)', 'Print answer sheet', 'आंसर शीट प्रिंट करो', 'பதில் தாளை அச்சிடு', '—'],
  ['Language', 'Change language', 'भाषा बदलो', 'மொழியை மாற்று', '—'],
  ['Repeat last prompt', 'Repeat / Say that again', 'दोहराओ / क्या कहा', 'மீண்டும் / மறுபடி சொல்லு', 'L'],
  ['Help', 'Help / What can I say', 'मदद / क्या बोलूं', 'உதவி / என்ன சொல்லணும்', 'H'],
];

function HelpPanel({ t }) {
  return (
    <section aria-labelledby="help-h">
      <h2 id="help-h">{t.help}: what you can say</h2>
      <p>
        Every command can be said in several everyday ways; the table shows some. Say <strong>Help</strong> (मदद / உதவி) at any time to hear the commands for the current step. Sounds tell you what the microphone is doing: two rising notes = say a command, three quick notes = recording your answer, a chord = saved, a low buzz = not understood. On phones the device also vibrates. <strong>Escape</strong> skips what the app is saying.
      </p>
      <div className="table-wrap">
        <table className="help-table">
          <thead>
            <tr><th scope="col">Action</th><th scope="col">English</th><th scope="col">हिंदी</th><th scope="col">தமிழ்</th><th scope="col">Keys</th></tr>
          </thead>
          <tbody>
            {HELP_ROWS.map(([a, en, hi, ta, k]) => (
              <tr key={a}>
                <th scope="row">{a}</th>
                <td lang="en-IN">{en}</td>
                <td lang="hi-IN">{hi}</td>
                <td lang="ta-IN">{ta}</td>
                <td>{k === '—' ? '—' : k.split(' / ').map((x) => `Alt+Shift+${x}`).join(' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Settings({ s }) {
  const st = s.settings;
  const RATES = [0.6, 0.75, 0.9, 0.95, 1.05, 1.2, 1.35, 1.5];
  return (
    <section aria-labelledby="settings-h">
      <h2 id="settings-h">Settings</h2>
      <div className="row col">
        <label className="check">
          <input type="checkbox" checked={st.voice} onChange={(e) => engine.updateSettings({ voice: e.target.checked })} /> Speak prompts aloud
        </label>
        <label className="check">
          <input type="checkbox" checked={st.earcons} onChange={(e) => engine.updateSettings({ earcons: e.target.checked })} /> Play sounds when the microphone starts, saves or fails
        </label>
        <label className="check">
          <input type="checkbox" checked={st.haptics} onChange={(e) => engine.updateSettings({ haptics: e.target.checked })} /> Vibrate with each sound (phones)
        </label>
        <label className="check">
          <input type="checkbox" checked={st.punctuation} onChange={(e) => engine.updateSettings({ punctuation: e.target.checked })} /> Spoken punctuation (“full stop”, “comma”, “next paragraph”)
        </label>
        <label className="check">
          <input type="checkbox" checked={st.mirror} onChange={(e) => engine.updateSettings({ mirror: e.target.checked })} /> Also send every prompt to my screen reader (may double-speak)
        </label>
        <label className="field inline">
          <span>Reminder after silence (never while recording an answer)</span>
          <select value={st.silenceSecs} onChange={(e) => engine.updateSettings({ silenceSecs: Number(e.target.value) })}>
            <option value={0}>Off</option>
            <option value={10}>10 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes</option>
          </select>
        </label>
        <label className="field inline">
          <span>Speech speed</span>
          <select value={st.rate} onChange={(e) => engine.updateSettings({ rate: Number(e.target.value) })}>
            {RATES.map((r) => (
              <option key={r} value={r}>{r}×</option>
            ))}
            {!RATES.includes(st.rate) && <option value={st.rate}>{st.rate}×</option>}
          </select>
        </label>
        <button type="button" className="btn ghost" onClick={() => window.confirm('Delete all saved answers and the activity log and start over?') && engine.reset()}>
          Start over (delete saved answers)
        </button>
      </div>
    </section>
  );
}

function Diagnostics({ s }) {
  const io = engine.io;
  const voice = (l) => (io.support.synthesis ? (s.voicesLoaded ? (io.hasVoice(l) ? `found (${io.voiceFor(l).name})` : 'not installed') : 'loading…') : 'n/a');
  return (
    <section aria-labelledby="diag-h">
      <h2 id="diag-h">Browser check</h2>
      <ul>
        <li>Speech recognition: {io.support.recognition ? 'available' : 'NOT available – use Google Chrome'}</li>
        <li>Speech synthesis: {io.support.synthesis ? 'available' : 'NOT available'}</li>
        <li>Microphone permission: {s.permission}</li>
        {LANGS.map((l) => (
          <li key={l}>Voice for {LANG_NAMES[l].en} ({l}): {voice(l)}</li>
        ))}
        <li>Answers are saved only in this browser (localStorage). Chrome’s speech recognition sends audio to an online service and needs internet.</li>
      </ul>
    </section>
  );
}
