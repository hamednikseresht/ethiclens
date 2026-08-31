import crypto from 'node:crypto';

/**
 * کپچای خودمیزبان.
 *
 * عمداً از reCAPTCHA و hCaptcha استفاده نشده: هم وابستگی به سرویس بیرونی
 * می‌آورد که ممکن است برای بخشی از کاربران در دسترس نباشد، هم داده کاربر
 * را به شخص ثالث می‌فرستد. این نسخه یک SVG سمت سرور می‌سازد و پاسخ را
 * در نشست نگه می‌دارد؛ هیچ چیزی از سامانه بیرون نمی‌رود.
 *
 * هدف اینجا متوقف‌کردن اسکریپت‌های ساده ثبت‌نام انبوه است، نه مقاومت در
 * برابر حمله‌کننده‌ای که OCR اجرا می‌کند. برای آن سطح، محدودیت نرخ و
 * تأیید دستی مدیر — که هر دو را داریم — سد مؤثرتری‌اند.
 */

const TTL_MS = 10 * 60 * 1000;      // ۱۰ دقیقه
const MAX_ATTEMPTS = 5;

const FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
const toFa = n => String(n).replace(/[0-9]/g, d => FA_DIGITS[+d]);

const rand = (min, max) => min + crypto.randomInt(max - min + 1);

/** مسئله ساده حسابی — برای کاربر فارسی‌زبان خواناتر از حروف درهم است */
function makeChallenge() {
  const ops = [
    () => { const a = rand(3, 19), b = rand(2, 9); return { q: `${toFa(a)} + ${toFa(b)}`, a: a + b }; },
    () => { const a = rand(10, 25), b = rand(2, 9); return { q: `${toFa(a)} − ${toFa(b)}`, a: a - b }; },
    () => { const a = rand(2, 9),  b = rand(2, 9); return { q: `${toFa(a)} × ${toFa(b)}`, a: a * b }; }
  ];
  return ops[crypto.randomInt(ops.length)]();
}

/** SVG با اعوجاج سبک: خطوط مزاحم، چرخش و جابه‌جایی هر نویسه */
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
 * چالش تازه می‌سازد و در نشست می‌گذارد.
 * پاسخ به شکل چکیده ذخیره می‌شود تا اگر محتوای نشست جایی لاگ شد، لو نرود.
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
 * پاسخ کاربر را می‌سنجد. چالش پس از هر بررسی — درست یا غلط — مصرف
 * می‌شود، تا نشود با یک چالش چند بار حدس زد.
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

  // ارقام فارسی و عربی را هم می‌پذیریم
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

  delete session.captcha;     // یک‌بارمصرف
  return ok
    ? { ok: true }
    : { ok: false, reason: 'wrong', error: 'پاسخ تصویر امنیتی درست نیست. دوباره تلاش کنید.' };
}
