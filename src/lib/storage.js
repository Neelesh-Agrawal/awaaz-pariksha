const KEY = 'awaazPariksha.v2';

export const PERSISTED_KEYS = [
  'lang', 'started', 'current', 'answers', 'history', 'log', 'pending', 'submitted', 'submittedAt', 'settings', 'cachedCommand',
  'setup', 'timerEndsAt', 'choices', 'visited', 'review', 'answerLang',
];

export function loadSaved() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    const out = {};
    for (const k of PERSISTED_KEYS) out[k] = state[k];
    window.localStorage.setItem(KEY, JSON.stringify(out));
    return true;
  } catch {
    return false;
  }
}

export function clearSaved() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
