// Short non-speech sounds so a student always knows what the microphone is doing.
let ctx = null;

export function initEarcons() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !ctx) ctx = new AC();
    ctx?.resume?.();
  } catch {
    ctx = null;
  }
}

function tone(freq, start, dur, type = 'sine', gain = 0.12) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  listen: () => { tone(660, 0, 0.12); tone(880, 0.12, 0.14); }, // rising: "your turn"
  record: () => { tone(880, 0, 0.1, 'triangle'); tone(880, 0.16, 0.1, 'triangle'); tone(1175, 0.32, 0.18, 'triangle'); }, // recording
  saved: () => { tone(523, 0, 0.15); tone(659, 0.1, 0.15); tone(784, 0.2, 0.3); }, // chord: done
  error: () => { tone(220, 0, 0.25, 'square', 0.06); tone(180, 0.25, 0.3, 'square', 0.06); }, // low buzz
  wake: () => { tone(1320, 0, 0.09); tone(1760, 0.08, 0.12); }, // bright ping: "I'm listening for an instruction"
  back: () => { tone(880, 0, 0.1, 'sine', 0.08); tone(660, 0.1, 0.14, 'sine', 0.08); }, // falling: back to your answer
  tick: () => { tone(1568, 0, 0.05, 'sine', 0.05); }, // soft tick: a sentence was written
};

export function playEarcon(name) {
  if (!ctx || !SOUNDS[name]) return;
  try {
    SOUNDS[name]();
  } catch {
    /* ignore */
  }
}

// Phones: a short vibration with each sound, so the state can also be felt.
const PATTERNS = { listen: [25], record: [30, 60, 30, 60, 30], saved: [20, 40, 70], error: [180], wake: [15, 30, 15], back: [20] };
export function buzz(name) {
  try {
    if (typeof navigator === 'undefined' || !navigator.vibrate || !PATTERNS[name]) return;
    // Only on touch devices, and only after the student has tapped (browsers block it before).
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    if (!window.matchMedia?.('(pointer: coarse)').matches) return;
    navigator.vibrate(PATTERNS[name]);
  } catch {
    /* ignore */
  }
}
