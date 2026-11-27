// Thin wrapper around the browser Web Speech API.
// - Recognition is stopped (aborted) whenever the app speaks, and restarted afterwards only
//   if the engine still expects listening.
// - An unexpected `onend` is restarted only while listening is expected.
// - Final results are de-duplicated by (session, resultIndex) and identical text within 800 ms.

const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture']);

function splitForTTS(text, max = 180) {
  const parts = String(text).match(/[^.?!।॥]+[.?!।॥]*\s*/gu) || [String(text)];
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > max && buf) {
      out.push(buf.trim());
      buf = '';
    }
    if (p.length > max) {
      // Very long run without punctuation: break on spaces.
      let rest = p;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(' ', max);
        if (cut < 40) cut = max;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut);
      }
      buf += rest;
    } else buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

export class SpeechIO {
  constructor(handlers) {
    this.h = handlers;
    const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.support = { recognition: !!SR, synthesis: !!this.synth };
    this.expected = false;
    this.running = false;
    this.starting = false;
    this.speaking = false;
    this.session = 0;
    this.seen = new Set();
    this.lastFinal = { text: '', at: 0 };
    this.sessionText = { session: -1, text: '' };
    this.errorTimes = [];
    this.lang = 'en-IN';
    this.speakToken = 0;
    this.voices = [];
    this.rate = 0.95;
    this.voiceEnabled = true;

    if (SR) {
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 3; // alternatives help match commands; dictation keeps the first
      r.onstart = () => {
        this.running = true;
        this.starting = false;
        this.h.onStatus?.('on');
      };
      r.onend = () => {
        this.running = false;
        this.starting = false;
        this.h.onStatus?.('off');
        if (this.expected && !this.speaking) {
          setTimeout(() => {
            if (this.expected && !this.speaking && !this.running && !this.starting) this._start();
          }, 250);
        }
      };
      r.onresult = (e) => this._onResult(e);
      r.onerror = (e) => this._onError(e);
      r.onspeechstart = () => this.h.onActivity?.();
      this.rec = r;
    }

    if (this.synth) {
      const load = () => {
        this.voices = this.synth.getVoices() || [];
        this.h.onVoices?.(this.voices);
      };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  // ---------- recognition ----------
  listen(lang) {
    this.lang = lang;
    this.expected = true;
    if (!this.rec || this.speaking) return;
    if (this.running || this.starting) {
      if (this.rec.lang !== lang) this.rec.abort(); // onend restarts with the new language
      return;
    }
    this._start();
  }

  /** Restart recognition so a changed setting (language, on-device) takes effect. */
  restart() {
    if (this.rec && (this.running || this.starting)) {
      try {
        this.rec.abort(); // onend restarts while listening is expected
      } catch {
        /* ignore */
      }
    }
  }

  stopListening() {
    this.expected = false;
    if (this.rec && (this.running || this.starting)) {
      try {
        this.rec.abort();
      } catch {
        /* ignore */
      }
    }
  }

  _start() {
    if (!this.rec) return;
    try {
      this.rec.lang = this.lang;
      // On-device recognition (Chrome): no audio leaves the computer and no internet is needed.
      if ('processLocally' in this.rec) this.rec.processLocally = !!this.processLocally;
      this.session += 1;
      this.starting = true;
      this.h.onStatus?.('starting');
      this.rec.start();
    } catch {
      this.starting = false; // already started; onend will retry if needed
    }
  }

  _onResult(e) {
    this.h.onActivity?.();
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const alt = res[0];
      if (res.isFinal) {
        const key = `${this.session}:${i}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        let text = (alt.transcript || '').trim();
        const now = Date.now();
        if (text && text === this.lastFinal.text && now - this.lastFinal.at < 800) continue;
        // Android Chrome repeats earlier words in each new final result of the same session.
        if (IS_ANDROID && this.sessionText.session === this.session && this.sessionText.text && text.startsWith(this.sessionText.text)) {
          const full = text;
          text = text.slice(this.sessionText.text.length).trim();
          this.sessionText.text = full;
          if (!text) continue;
        } else {
          this.sessionText = { session: this.session, text };
        }
        this.lastFinal = { text, at: now };
        this.errorTimes = [];
        const alts = [text, ...Array.from(res).slice(1).map((a) => (a.transcript || '').trim()).filter(Boolean)];
        this.h.onFinal?.(text, typeof alt.confidence === 'number' ? alt.confidence : 0, alts);
        if (this.speaking) break; // a handler started speech; ignore the rest of this event
      } else {
        interim += alt.transcript;
      }
    }
    this.h.onInterim?.(interim.trim());
  }

  _onError(e) {
    const code = e.error;
    if (code === 'aborted') return; // we abort on purpose before speaking
    if (code === 'no-speech') {
      this.h.onNoSpeech?.();
      return;
    }
    let fatal = FATAL.has(code);
    if (!fatal) {
      const now = Date.now();
      this.errorTimes = [...this.errorTimes.filter((t) => now - t < 20000), now];
      if (this.errorTimes.length >= 3) fatal = true; // stop a restart loop (e.g. offline)
    }
    if (fatal) this.expected = false;
    this.h.onError?.(code, fatal);
  }

  resetErrors() {
    this.errorTimes = [];
  }

  // ---------- synthesis ----------
  voiceFor(lang) {
    const want = lang.toLowerCase();
    const norm = (v) => v.lang.replace('_', '-').toLowerCase();
    return (
      this.voices.find((v) => norm(v) === want && v.localService) ||
      this.voices.find((v) => norm(v) === want) ||
      this.voices.find((v) => norm(v).startsWith(want.slice(0, 2) + '-')) ||
      null
    );
  }

  hasVoice(lang) {
    return !!this.voiceFor(lang);
  }

  canSpeak(lang) {
    if (!this.synth || !this.voiceEnabled) return false;
    if (this.voices.length === 0) return true; // voice list not loaded: try anyway
    return this.hasVoice(lang);
  }

  /** Speak [{text, lang}] segments in order, then call onDone. */
  speak(segments, onDone) {
    this._cancelSynth();
    const token = ++this.speakToken;
    this.speaking = true;
    this.pendingDone = onDone;
    this.stopListeningForSpeech();

    const pieces = segments
      .filter((s) => s.text && this.canSpeak(s.lang))
      .flatMap((s) => splitForTTS(s.text).map((text) => ({ text, lang: s.lang })));

    const finish = () => {
      if (token !== this.speakToken) return;
      clearTimeout(this.ttsTimer);
      this.speaking = false;
      const cb = this.pendingDone;
      this.pendingDone = null;
      cb?.();
    };

    if (pieces.length === 0) {
      setTimeout(finish, 150);
      return;
    }

    let idx = 0;
    const next = () => {
      if (token !== this.speakToken) return;
      if (idx >= pieces.length) return finish();
      const p = pieces[idx++];
      let done = false;
      const advance = () => {
        if (done) return;
        done = true;
        clearTimeout(this.ttsTimer);
        next();
      };
      const u = new SpeechSynthesisUtterance(p.text);
      u.lang = p.lang;
      const v = this.voiceFor(p.lang);
      if (v) u.voice = v;
      u.rate = this.rate;
      u.onend = advance;
      u.onerror = advance;
      // Watchdog: some voices never fire onend.
      clearTimeout(this.ttsTimer);
      this.ttsTimer = setTimeout(advance, 6000 + (p.text.length * 160) / this.rate);
      this.synth.speak(u);
    };
    setTimeout(next, 80); // Chrome drops speak() issued right after cancel()
  }

  stopListeningForSpeech() {
    if (this.rec && (this.running || this.starting)) {
      try {
        this.rec.abort();
      } catch {
        /* ignore */
      }
    }
  }

  /** Stop speaking now and continue as if speech had finished. */
  skip() {
    if (!this.speaking) return;
    const cb = this.pendingDone;
    this.pendingDone = null;
    this._cancelSynth();
    this.speaking = false;
    cb?.();
  }

  /** Stop speaking without continuing (a new action replaces it). */
  cancel() {
    this.pendingDone = null;
    this._cancelSynth();
    this.speaking = false;
  }

  _cancelSynth() {
    this.speakToken += 1;
    clearTimeout(this.ttsTimer);
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
  }
}

// ---------- on-device (offline) recognition ----------
const SRClass = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' (browser has no on-device API). */
export async function onDeviceStatus(lang) {
  const SR = SRClass();
  if (!SR || typeof SR.available !== 'function') return 'unsupported';
  try {
    return await SR.available({ langs: [lang], processLocally: true, quality: 'dictation' });
  } catch {
    try {
      return await SR.available({ langs: [lang], processLocally: true });
    } catch {
      return 'unavailable';
    }
  }
}

/** Download the language pack. Must be called from a click. Resolves true when installed. */
export async function installOnDevice(lang) {
  const SR = SRClass();
  if (!SR || typeof SR.install !== 'function') return false;
  try {
    return await SR.install({ langs: [lang], processLocally: true, quality: 'dictation' });
  } catch {
    try {
      return await SR.install({ langs: [lang], processLocally: true });
    } catch {
      return false;
    }
  }
}
