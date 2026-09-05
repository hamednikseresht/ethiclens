/**
 * Light, dark, or whatever the phone is set to.
 *
 * The stylesheet already handles all three: bare :root is light, a
 * prefers-color-scheme block covers the system case, and :root[data-theme]
 * overrides both. So this only has to write that one attribute — removing it
 * for 'system' rather than computing light or dark ourselves, which would
 * freeze the choice at page load and stop following the phone afterwards.
 *
 * Reads and writes are wrapped because storage throws outright in some
 * contexts (private windows with site data blocked), and a settings page that
 * cannot render is a worse outcome than a preference that does not persist.
 */

const KEY = 'ethiclens.theme';
export const THEMES = ['system', 'light', 'dark'];

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'system';
  } catch { return 'system'; }
}

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'system';
  const root = document.documentElement;

  if (value === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value);

  // The browser chrome around a standalone window is painted from this, so it
  // has to follow the choice or an installed dark app keeps a light bar.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(root).getPropertyValue('--color-background').trim();
    if (bg) meta.setAttribute('content', bg);
  }

  try { localStorage.setItem(KEY, value); } catch { /* preference is not critical */ }
  return value;
}

/**
 * Called before React renders, so the first paint is already correct — doing
 * it in an effect shows a flash of light theme on a dark phone.
 */
export function initTheme() {
  applyTheme(getTheme());
}
