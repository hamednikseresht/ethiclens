/* ==========================================================================
   Reading material for the waiting screen.

   Two sources, deliberately mixed. The quotations are all from works old
   enough to be in the public domain, so they can be given verbatim with their
   source named. For living and recent thinkers — Rawls, Gilligan, Singer,
   MacIntyre, Scanlon — no quotation is invented: their lenses appear as the
   core question this product already asks on their behalf, which is honest
   about being our phrasing rather than theirs.
   ========================================================================== */

/** Verbatim, public-domain, with the work named. */
const QUOTES = [
  { text: 'چنان عمل کن که بتوانی بخواهی قاعده عملت قانونی عام شود.',
    who: 'ایمانوئل کانت', work: 'بنیاد مابعدالطبیعه اخلاق، ۱۷۸۵', lens: 'deontology' },

  { text: 'انسانیت را همواره هم‌زمان غایت بدان، نه هرگز صرفاً وسیله.',
    who: 'ایمانوئل کانت', work: 'بنیاد مابعدالطبیعه اخلاق، ۱۷۸۵', lens: 'deontology' },

  { text: 'پرسش این نیست که آیا می‌توانند استدلال کنند، یا سخن بگویند؛ پرسش این است که آیا می‌توانند رنج ببرند؟',
    who: 'جرمی بنتام', work: 'مقدمه‌ای بر اصول اخلاق و قانون‌گذاری، ۱۷۸۹', lens: 'utilitarianism' },

  { text: 'تنها آزادی‌ای که شایسته این نام است، آزادیِ پی‌گرفتن خیر خویش به شیوه خویش است.',
    who: 'جان استوارت میل', work: 'درباره آزادی، ۱۸۵۹', lens: 'utilitarianism' },

  { text: 'بهتر است انسانی ناخرسند باشی تا خوکی خرسند.',
    who: 'جان استوارت میل', work: 'فایده‌گرایی، ۱۸۶۳', lens: 'utilitarianism' },

  { text: 'فضیلت، حالتی از منش است که به انتخاب مربوط می‌شود و در حد وسط قرار دارد.',
    who: 'ارسطو', work: 'اخلاق نیکوماخوس، حدود ۳۴۰ پ.م', lens: 'virtue' },

  { text: 'با انجام کارهای عادلانه، عادل می‌شویم؛ و با انجام کارهای شجاعانه، شجاع.',
    who: 'ارسطو', work: 'اخلاق نیکوماخوس، حدود ۳۴۰ پ.م', lens: 'virtue' },

  { text: 'اگر چراییِ زندگی را داشته باشی، با تقریباً هر چگونگی کنار می‌آیی.',
    who: 'فریدریش نیچه', work: 'غروب بت‌ها، ۱۸۸۸', lens: 'nietzsche' },

  { text: 'اگر دیرزمانی در ژرفا بنگری، ژرفا نیز در تو می‌نگرد.',
    who: 'فریدریش نیچه', work: 'فراسوی نیک و بد، ۱۸۸۶', lens: 'nietzsche' },

  { text: 'زندگی را تنها رو به عقب می‌توان فهمید، ولی باید رو به جلو زیستش.',
    who: 'سورن کی‌یرکگور', work: 'یادداشت‌های روزانه، ۱۸۴۳', lens: 'existentialism' }
];

/** Our own framing of each lens — not attributed as anyone's words. */
const LENS_QUESTIONS = [
  { text: 'انسان بافضیلت در این موقعیت چه می‌کرد؟', who: 'پرسش بنیادین فضیلت‌گرایی', work: 'ارسطو، مک‌اینتایر', lens: 'virtue' },
  { text: 'آیا می‌توان این کار را قانونی عام کرد؟ کرامت کسی نقض می‌شود؟', who: 'پرسش بنیادین وظیفه‌گرایی', work: 'کانت، راس', lens: 'deontology' },
  { text: 'کدام گزینه بیشترین خیر و کمترین رنج را می‌سازد؟', who: 'پرسش بنیادین فایده‌گرایی', work: 'بنتام، میل، سینگر', lens: 'utilitarianism' },
  { text: 'این تصمیم با شرایط مشترکِ زندگی جمعی چه می‌کند؟', who: 'پرسش بنیادین خیر مشترک', work: 'سنت ارسطویی-رواقی', lens: 'commongood' },
  { text: 'پشت پرده جهل، چه قاعده‌ای را تصویب می‌کردید؟', who: 'پرسش بنیادین قراردادگرایی', work: 'رالز، اسکنلون', lens: 'contractualism' },
  { text: 'این تصمیم با آسیب‌پذیرترین فرد رابطه چه می‌کند؟', who: 'پرسش بنیادین اخلاق مراقبت', work: 'گیلیگان، نادینگز', lens: 'care' },
  { text: 'آیا مسئولیت اصیل این انتخاب را می‌پذیرید؟', who: 'پرسش بنیادین اگزیستانسیالیسم', work: 'کی‌یرکگور، کامو', lens: 'existentialism' },
  { text: 'ریشه این ارزش شجاعت است یا ترس از قضاوت دیگران؟', who: 'پرسش بنیادین تبارشناسی', work: 'نیچه', lens: 'nietzsche' }
];

const ICON = {
  virtue: '🏛️', deontology: '⚖️', utilitarianism: '📊', commongood: '🏘️',
  contractualism: '🤝', care: '🫂', existentialism: '🕯️', nietzsche: '⛰️'
};

/**
 * A shuffled deck of everything, so a wait never repeats a card before it has
 * shown the rest. Shuffled per call: two analyses in a row should not read
 * identically.
 */
export function quoteDeck() {
  const deck = [...QUOTES, ...LENS_QUESTIONS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.map(q => ({ ...q, icon: ICON[q.lens] || '💭' }));
}

export function quoteMarkup(q) {
  return `
    <span class="q-icon" aria-hidden="true">${q.icon}</span>
    <blockquote class="q-text">${q.text}</blockquote>
    <cite class="q-who">${q.who}<span class="q-work">${q.work}</span></cite>`;
}
