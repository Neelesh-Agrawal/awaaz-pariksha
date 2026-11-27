// Live loudness of the student's voice, for the on-screen voice visual only.
// It never records or sends audio; speech recognition has its own microphone access.
// On Android, Chrome cannot share the microphone between this and speech recognition, so the
// visual falls back to "pulses" whenever recognition reports words.
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');

let ctx = null;
let analyser = null;
let buf = null;
let stream = null;
let smooth = 0;
let bump = 0;

export async function startLevel() {
  if (stream || IS_ANDROID || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    src.connect(analyser);
    buf = new Float32Array(analyser.fftSize);
    return true;
  } catch {
    stream = null;
    analyser = null;
    return false;
  }
}

/** Recognition heard words: make the visual move even without a live level. */
export function bumpLevel(v = 0.55) {
  bump = Math.max(bump, v);
}

/** 0 … 1, smoothed: rises fast, falls slowly, like a VU meter. */
export function getLevel() {
  let raw = 0;
  if (analyser) {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    raw = Math.min(1, Math.max(0, (rms - 0.008) * 10));
  }
  bump *= 0.92;
  raw = Math.max(raw, bump);
  smooth += (raw - smooth) * (raw > smooth ? 0.45 : 0.1);
  return smooth;
}

export const hasLiveLevel = () => !!analyser;
