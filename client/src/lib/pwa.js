/**
 * Service worker registration and the install prompt.
 *
 * Registered after load rather than during it: the worker's install step
 * fetches the pre-cache list, and doing that while the page is still painting
 * competes with the very assets the person is waiting for.
 *
 * The scope is /app/, which is exactly what the installed app covers. The
 * homepage and the public pages are outside it on purpose: they are plain
 * server-rendered documents that the browser and the CDN can cache on their
 * own, and a worker in front of them would only add a layer to go wrong.
 */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/app/' })
      .then(retireOldScope)
      .catch(err => console.warn('[pwa] registration failed:', err.message));
  };

  /**
   * Anyone who used the app before it moved to the root still has a worker
   * registered at /v2/. Registering a new scope does not replace it, and it
   * would go on answering for that path — which now only exists to redirect.
   * Unregistering it is the only way it leaves.
   */
  const retireOldScope = async () => {
    try {
      for (const reg of await navigator.serviceWorker.getRegistrations()) {
        if (!reg.scope.endsWith('/app/')) await reg.unregister();
      }
    } catch { /* nothing here is worth breaking startup over */ }
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

/** Already running as an installed app rather than in a browser tab. */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    // iOS predates the media query and reports it here instead.
    || window.navigator.standalone === true;
}

/**
 * iOS Safari, which installs apps but never fires beforeinstallprompt.
 *
 * Without this the install card simply never appears on an iPhone and the
 * feature looks absent rather than manual. Detection is by platform because
 * there is nothing to feature-detect: the capability exists, the event does
 * not. iPadOS reports itself as a Mac, so touch points disambiguate.
 */
export function isIosSafari() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Chrome and Firefox on iOS wrap WebKit but cannot add to the home screen.
  const safari = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && safari;
}
