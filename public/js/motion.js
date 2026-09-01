/* ==========================================================================
   Ethic Lens — motion behaviours
   Everything here is disabled by prefers-reduced-motion, and none of it is
   required: if this file fails to load, the page still works.
   ========================================================================== */

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------------------------------
   1. Reveal on scroll
   -------------------------------------------------------------------------- */
let observer = null;

function ensureObserver() {
  if (observer || reduced) return observer;
  observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      observer.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  return observer;
}

/**
 * Reveals the selected elements as they scroll into view.
 *
 * The `reveal` class makes an element invisible, so if the observer fails
 * for any reason the content would stay hidden forever. Hence two guards:
 *  1. when IntersectionObserver is unavailable, nothing is hidden at all.
 *  2. a safety timeout reveals anything still not shown by then
 *     (e.g. the page opened in a background tab and the observer never fired).
 */
const REVEAL_FAILSAFE_MS = 4000;
let failsafeTimer = null;

function armFailsafe() {
  clearTimeout(failsafeTimer);
  failsafeTimer = setTimeout(() => {
    for (const el of document.querySelectorAll('.reveal:not(.in)')) el.classList.add('in');
  }, REVEAL_FAILSAFE_MS);
}

export function revealOnScroll(selector, root = document) {
  if (reduced || !('IntersectionObserver' in window)) return;
  const obs = ensureObserver();
  for (const el of root.querySelectorAll(selector)) {
    if (el.dataset.revealBound) continue;
    el.dataset.revealBound = '1';
    el.classList.add('reveal');
    obs.observe(el);
  }
  armFailsafe();
}

/** When the user returns to the tab, reveal anything left behind */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') armFailsafe();
});

/* --------------------------------------------------------------------------
   2. Number counting
   -------------------------------------------------------------------------- */
const FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
const toFa = n => String(n).replace(/[0-9]/g, d => FA[+d]);

/**
 * Counts a number up from zero to its final value.
 * el must carry data-count, or the value is passed as an argument.
 */
export function countUp(el, value, { duration = 900, decimals = 0, suffix = '' } = {}) {
  const target = Number(value);
  if (!Number.isFinite(target)) return;      // the value already in the HTML is left untouched

  // In a hidden tab requestAnimationFrame never runs — set the final value directly
  if (reduced || target === 0 || document.hidden) {
    el.textContent = toFa(target.toFixed(decimals)) + suffix;
    return;
  }

  const start = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);

  const tick = now => {
    const p = Math.min(1, (now - start) / duration);
    const v = target * ease(p);
    el.textContent = toFa(v.toFixed(decimals)) + suffix;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = toFa(target.toFixed(decimals)) + suffix;
  };
  requestAnimationFrame(tick);
}

/** Counts every [data-count] element once it enters the viewport */
export function countUpAll(root = document) {
  const els = [...root.querySelectorAll('[data-count]')].filter(e => !e.dataset.counted);
  if (!els.length) return;

  const run = el => {
    el.dataset.counted = '1';
    countUp(el, el.dataset.count, {
      decimals: Number(el.dataset.decimals || 0),
      suffix: el.dataset.suffix || ''
    });
  };

  if (reduced || !('IntersectionObserver' in window)) { els.forEach(run); return; }

  const obs = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      run(e.target);
      obs.unobserve(e.target);
    }
  }, { threshold: 0.3 });
  els.forEach(el => obs.observe(el));
}

/* --------------------------------------------------------------------------
   3. Chart bar growth
   -------------------------------------------------------------------------- */
export function animateBars(host) {
  if (!host || reduced) return;

    // In a hidden tab the animation never advances and the bars stick at zero
    // height, so growth is deferred until the page is actually visible.
  if (document.hidden) {
    document.addEventListener('visibilitychange', function once() {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', once);
      animateBars(host);
    });
    return;
  }

  host.querySelectorAll('.bar').forEach((b, i) => {
    b.style.animationDelay = `${Math.min(i * 14, 420)}ms`;
  });
  host.classList.add('animate');
}

/* --------------------------------------------------------------------------
   4. Progressive fill of the flowchart stage connector
   -------------------------------------------------------------------------- */
/** Fills the line between stage i and i+1 once stage i has a verdict */
export function syncStageLinks(root = document) {
  const stages = [...root.querySelectorAll('.stage')];
  const links = [...root.querySelectorAll('.stage-link')];
  stages.forEach((st, i) => {
    const decided = !!st.dataset.state;
    if (links[i]) links[i].classList.toggle('filled', decided);
  });
}

/* --------------------------------------------------------------------------
   5. Touch ripple on buttons
   -------------------------------------------------------------------------- */
export function wireButtonRipple() {
  if (reduced) return;
  document.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--rx', `${((e.clientX - r.left) / r.width) * 100}%`);
    btn.style.setProperty('--ry', `${((e.clientY - r.top) / r.height) * 100}%`);
  }, { passive: true });
}

/* --------------------------------------------------------------------------
   6. Smooth scroll to an element
   -------------------------------------------------------------------------- */
export function scrollToEl(el, offset = 80) {
  if (!el) return;
  const top = el.getBoundingClientRect().top + scrollY - offset;
  scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
}

/* --------------------------------------------------------------------------
   7. General page bootstrap
   -------------------------------------------------------------------------- */
export function initMotion({ reveal = '.card, .res-block, .stat, .rec, .item' } = {}) {
  wireButtonRipple();
  countUpAll();
  if (reveal) revealOnScroll(reveal);
  document.querySelector('main')?.classList.add('page-enter');
}
