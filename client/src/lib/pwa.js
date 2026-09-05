/**
 * Service worker registration and the install prompt.
 *
 * Registered after load rather than during it: the worker's install step
 * fetches the pre-cache list, and doing that while the page is still painting
 * competes with the very assets the person is waiting for.
 *
 * The scope is /v2/ because that is where the app lives. A worker registered
 * at the root would claim the pages the current product still serves, and
 * start answering for screens it knows nothing about.
 */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/v2/' })
      .catch(err => console.warn('[pwa] registration failed:', err.message));
  };

  // Waiting on `load` unconditionally would mean never registering at all in
  // the cases where it has already fired by the time this module runs — a
  // restore from the back/forward cache, or a hot reload in development. The
  // listener only helps while the document is still loading.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/**
 * Capture the install prompt so it can be offered at a sensible moment.
 *
 * The browser fires this once and only when it decides the app qualifies.
 * Not preventing the default would let it surface its own banner whenever it
 * likes — often mid-analysis, which is the worst time to interrupt someone.
 */
export function watchInstallPrompt(onAvailable) {
  let deferred = null;

  const show = async () => {
    if (!deferred) return null;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    return outcome;
  };

  const onPrompt = (e) => {
    e.preventDefault();
    deferred = e;
    onAvailable?.(show);
  };
  const onInstalled = () => { deferred = null; onAvailable?.(null); };

  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);

  // Returned so a component can stop listening when it unmounts; without it,
  // navigating away and back stacks a second listener onto the same event.
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}
