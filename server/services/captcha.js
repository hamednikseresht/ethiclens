import crypto from 'node:crypto';

/**
 * Self-hosted CAPTCHA.
 *
 * reCAPTCHA and hCaptcha were avoided deliberately: both add a dependency
 * on an outside service that may be unreachable for some users, and both
 * send user data to a third party. This builds an SVG server-side and keeps
 * the answer in the session; nothing leaves the system.
 *
 * The goal is to stop simple bulk-signup scripts, not an attacker running
 * OCR. For that level, rate limiting and manual admin approval — both of
 * which exist here — are the more effective barrier.
 */

const TTL_MS = 10 * 60 * 1000;      // 10 minutes
const MAX_ATTEMPTS = 5;

const FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
const toFa = n => String(n).replace(/[0-9]/g, d => FA_DIGITS[+d]);

const rand = (min, max) => min + crypto.randomInt(max - min + 1);

/** A simple arithmetic problem — easier to read for a Persian speaker than jumbled letters */
function makeChallenge() {
  const ops = [
    () => { const a = rand(3, 19), b = rand(2, 9); return { q: `${toFa(a)} + ${toFa(b)}`, a: a + b }; },
    () => { const a = rand(10, 25), b = rand(2, 9); return { q: `${toFa(a)} − ${toFa(b)}`, a: a - b }; },
    () => { const a = rand(2, 9),  b = rand(2, 9); return { q: `${toFa(a)} × ${toFa(b)}`, a: a * b }; }
  ];
  return ops[crypto.randomInt(ops.length)]();
}

/** SVG with light distortion: noise lines, plus per-character rotation and offset */
function renderSvg(text) {
  const W = 190, H = 62;
  const chars = [...text];
  const step = (W - 40) / Math.max(1, chars.length);

  const glyphs = chars.map((ch, i) => {
    const x = 20 + i * step + rand(-3, 3);
    const y = H / 2 + rand(-5, 5) + 8;
    const rot = rand(-14, 14);
    const size = rand(24, 30);
    const hue = rand(200, 260);
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="700"
             fill="hsl(${hue} 55% 38%)" transform="rotate(${rot} ${x} ${y})"
             font-family="Tahoma, sans-serif">${ch}</text>`;
  }).join('');

  const noise = Array.from({ length: 5 }, () => {
    const x1 = rand(0, W), y1 = rand(0, H), x2 = rand(0, W), y2 = rand(0, H);
    return `<path d="M${x1} ${y1} Q ${rand(0, W)} ${rand(0, H)} ${x2} ${y2}"
             stroke="hsl(${rand(200, 260)} 45% 62%)" stroke-width="1.4" fill="none" opacity=".55"/>`;
  }).join('');

  const dots = Array.from({ length: 22 }, () =>
    `<circle cx="${rand(0, W)}" cy="${rand(0, H)}" r="${rand(1, 2)}"
      fill="hsl(${rand(200, 260)} 45% 70%)" opacity=".6"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="تصویر امنیتی">
  <rect width="${W}" height="${H}" rx="10" fill="#f1f5f9"/>
  ${noise}${dots}${glyphs}
</svg>`;
}

/**
 * Build a fresh challenge and store it in the session.
 * The answer is stored hashed, so it does not leak if session contents are logged.
 */
export function issueCaptcha(session) {
  const { q, a } = makeChallenge();
  session.captcha = {
    hash: crypto.createHash('sha256').update(String(a)).digest('hex'),
    expires: Date.now() + TTL_MS,
    attempts: 0
  };
  return { svg: renderSvg(q), question: q };
}

/**
 * Check the user's answer. The challenge is consumed on every check — right
 * or wrong — so one challenge cannot be guessed at repeatedly.
 */
export function verifyCaptcha(session, answer) {
  const c = session?.captcha;
  if (!c) return { ok: false, reason: 'missing', error: 'تصویر امنیتی منقضی شده است. صفحه را تازه کنید.' };

  if (Date.now() > c.expires) {
    delete session.captcha;
    return { ok: false, reason: 'expired', error: 'مهلت تصویر امنیتی تمام شد. تصویر تازه بگیرید.' };
  }

  c.attempts = (c.attempts || 0) + 1;
  if (c.attempts > MAX_ATTEMPTS) {
    delete session.captcha;
    return { ok: false, reason: 'attempts', error: 'تلاش‌های زیاد. تصویر تازه بگیرید.' };
  }

  // Persian and Arabic digits are accepted too
  const normalized = String(answer ?? '')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[^\d-]/g, '')
    .trim();

  if (!normalized) {
    return { ok: false, reason: 'empty', error: 'پاسخ تصویر امنیتی را وارد کنید.' };
  }

  const expected = crypto.createHash('sha256').update(normalized).digest('hex');
  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c.hash));

  delete session.captcha;     // single use
  return ok
    ? { ok: true }
    : { ok: false, reason: 'wrong', error: 'پاسخ تصویر امنیتی درست نیست. دوباره تلاش کنید.' };
}
