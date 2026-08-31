/* ==========================================================================
   EthicLens — رفتارهای حرکتی
   همه چیز با prefers-reduced-motion غیرفعال می‌شود و هیچ‌کدام برای
   کارکرد صفحه ضروری نیست: اگر این فایل بارگذاری نشود، صفحه سالم می‌ماند.
   ========================================================================== */

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------------------------------
   ۱. آشکارسازی هنگام اسکرول
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
 * عناصر انتخاب‌شده را هنگام ورود به دید نمایان می‌کند.
 *
 * کلاس `reveal` عنصر را نامرئی می‌کند، پس اگر ناظر به هر دلیلی کار نکند
 * محتوا برای همیشه پنهان می‌ماند. برای همین دو محافظ داریم:
 *  ۱. اگر IntersectionObserver در دسترس نباشد، اصلاً چیزی پنهان نمی‌شود.
 *  ۲. یک مهلت امن، هر چیزی را که تا آن زمان نمایان نشده آشکار می‌کند
 *     (مثلاً وقتی صفحه در تب پنهان باز شده و ناظر شلیک نکرده است).
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

/** وقتی کاربر به تب برمی‌گردد، هر چیز جامانده را نمایان کن */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') armFailsafe();
});

/* --------------------------------------------------------------------------
   ۲. شمارش عددی
   -------------------------------------------------------------------------- */
const FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
const toFa = n => String(n).replace(/[0-9]/g, d => FA[+d]);

/**
 * عدد را از صفر تا مقدار نهایی می‌شمارد.
 * el باید data-count داشته باشد یا مقدار در آرگومان بیاید.
 */
export function countUp(el, value, { duration = 900, decimals = 0, suffix = '' } = {}) {
  const target = Number(value);
  if (!Number.isFinite(target)) return;      // مقدار موجود در HTML دست‌نخورده می‌ماند

  // در تب پنهان، requestAnimationFrame اجرا نمی‌شود — مستقیم مقدار نهایی را بگذار
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

/** همه عناصر [data-count] را وقتی وارد دید شدند می‌شمارد */
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
   ۳. رشد میله‌های نمودار
   -------------------------------------------------------------------------- */
export function animateBars(host) {
  if (!host || reduced) return;

  // در تب پنهان انیمیشن پیش نمی‌رود و میله‌ها در ارتفاع صفر گیر می‌کنند،
  // پس رشد را به لحظه‌ای موکول می‌کنیم که صفحه واقعاً دیده شود.
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
   ۴. پر شدن پیش‌رونده خط اتصال مراحل فلوچارت
   -------------------------------------------------------------------------- */
/** خط میان مرحله i و i+1 را وقتی مرحله i نتیجه گرفت، پر می‌کند */
export function syncStageLinks(root = document) {
  const stages = [...root.querySelectorAll('.stage')];
  const links = [...root.querySelectorAll('.stage-link')];
  stages.forEach((st, i) => {
    const decided = !!st.dataset.state;
    if (links[i]) links[i].classList.toggle('filled', decided);
  });
}

/* --------------------------------------------------------------------------
   ۵. موج لمس روی دکمه‌ها
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
   ۶. اسکرول نرم به یک عنصر
   -------------------------------------------------------------------------- */
export function scrollToEl(el, offset = 80) {
  if (!el) return;
  const top = el.getBoundingClientRect().top + scrollY - offset;
  scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
}

/* --------------------------------------------------------------------------
   ۷. راه‌اندازی عمومی صفحه
   -------------------------------------------------------------------------- */
export function initMotion({ reveal = '.card, .res-block, .stat, .rec, .item' } = {}) {
  wireButtonRipple();
  countUpAll();
  if (reveal) revealOnScroll(reveal);
  document.querySelector('main')?.classList.add('page-enter');
}
