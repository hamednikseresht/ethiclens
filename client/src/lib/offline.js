/**
 * Device-side cache for history and the last opened results.
 *
 * The service worker never intercepts /api — a cached GET of the analysis
 * stream would freeze the SSE, and a cached HTML document would hand person B
 * person A's signed-in screen. What can live offline is therefore written
 * here, into localStorage, after a successful response, and read only when
 * the network is gone.
 *
 * The cache is this device and this origin. Sign-out and account deletion
 * wipe it so a shared phone does not keep the previous person's dilemmas.
 */

const PREFIX = 'ethiclens.cache.';
const USER_KEY = PREFIX + 'user';
const HISTORY_KEY = PREFIX + 'history';
const STATS_KEY = PREFIX + 'stats';
const META_KEY = PREFIX + 'meta';
const RESULTS_KEY = PREFIX + 'results';
const MAX_RESULTS = 5;

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Fetch failed because the network did, not because the server said no. */
export function isNetworkFailure(err) {
  if (isOffline()) return true;
  if (!err) return false;
  if (typeof err.status === 'number') return false;
  return err.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(err.message || '');
}

export function cacheHistory(data) {
  write(HISTORY_KEY, data);
}

export function readHistory() {
  return read(HISTORY_KEY);
}

export function cacheStats(data) {
  write(STATS_KEY, data);
}

export function readStats() {
  return read(STATS_KEY);
}

export function cacheMeta(data) {
  write(META_KEY, data);
}

export function readMeta() {
  return read(META_KEY);
}

export function cacheResult(analysis) {
  if (!analysis?.id) return;
  const list = read(RESULTS_KEY) || [];
  const next = [
    slim(analysis),
    ...list.filter(a => String(a.id) !== String(analysis.id))
  ].slice(0, MAX_RESULTS);
  write(RESULTS_KEY, next);
}

export function readResult(id) {
  if (id == null) return null;
  const list = read(RESULTS_KEY) || [];
  return list.find(a => String(a.id) === String(id)) || null;
}

export function hasOfflineCache() {
  return Boolean(readHistory() || read(RESULTS_KEY)?.length);
}

/**
 * Bind the cache to the signed-in account. A different user on the same
 * phone must not inherit the previous person's dilemmas.
 */
export function bindCacheUser(userId) {
  if (userId == null) return;
  const prev = readRaw(USER_KEY);
  if (prev && prev !== String(userId)) clearOfflineCache();
  writeRaw(USER_KEY, String(userId));
}

export function clearOfflineCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch { /* private mode */ }
}

function slim(analysis) {
  // The admin category list is session-wide and not part of the document.
  const { categories, ...rest } = analysis;
  return rest;
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // Quota: drop stored results and try once more with just this write.
    try {
      localStorage.removeItem(RESULTS_KEY);
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
    } catch { /* still full or blocked */ }
  }
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.v ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

function readRaw(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
