// The "is it hearing me?" visual: a soft orb that swells with the student's voice (like Siri's
// orb or Wispr Flow's line), ripples while the app speaks, and breathes slowly while the student
// thinks. It is decorative for the student (aria-hidden) and a quick read for an invigilator.
import React, { useEffect, useRef } from 'react';
import { getLevel } from '../lib/micLevel.js';
import { Mic, MicOff, Speaker, Pause, Check, Question, Pencil, Alert, Dots } from './Icons.jsx';

const ICONS = {
  speaking: Speaker,
  instructing: Mic,
  listening: Mic,
  recording: Mic,
  thinking: Dots,
  'recording-quiet': Dots,
  waiting: Question,
  editing: Pencil,
  paused: Pause,
  submitted: Check,
  off: MicOff,
  problem: Alert,
};
const LIVE = new Set(['instructing', 'listening', 'recording', 'editing', 'waiting', 'thinking', 'recording-quiet']);
const BARS = 9;

export function VoiceOrb({ state, size = 'lg' }) {
  const core = useRef(null);
  const halo = useRef(null);
  const bars = useRef([]);
  const hist = useRef(Array(BARS).fill(0));

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;
    let raf;
    let frame = 0;
    const t0 = performance.now();
    const loop = (now) => {
      const t = (now - t0) / 1000;
      let lvl = 0;
      if (state === 'speaking') lvl = 0.22 + 0.16 * Math.sin(t * 5.2) + 0.08 * Math.sin(t * 11.7 + 1);
      else if (LIVE.has(state)) lvl = getLevel();
      lvl = Math.max(0, Math.min(1, lvl));
      if (core.current) core.current.style.transform = `scale(${1 + lvl * 0.22})`;
      if (halo.current) {
        halo.current.style.transform = `scale(${1 + lvl * 0.75})`;
        halo.current.style.opacity = String(0.18 + lvl * 0.55);
      }
      if (++frame % 3 === 0) {
        hist.current = [...hist.current.slice(1), lvl];
        bars.current.forEach((b, i) => {
          if (!b) return;
          // Mirror the history so the line grows from the middle outwards.
          const k = Math.abs(i - (BARS - 1) / 2);
          const v = hist.current[BARS - 1 - Math.round(k)] ?? 0;
          b.style.transform = `scaleY(${0.12 + v * (1 - k * 0.08)})`;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const Icon = ICONS[state] || Mic;
  return (
    <div className={`orb orb-${size} is-${state}`} aria-hidden="true">
      <div className="orb-halo" ref={halo} />
      <div className="orb-ring" />
      <div className="orb-core" ref={core}>
        <Icon size={size === 'lg' ? 34 : 22} />
      </div>
      {size === 'lg' && (
        <div className="orb-wave">
          {Array.from({ length: BARS }, (_, i) => (
            <span key={i} ref={(el) => (bars.current[i] = el)} />
          ))}
        </div>
      )}
    </div>
  );
}
