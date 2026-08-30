/**
 * منبع مشترک مکاتب و مراحل فلوچارت (سرور و کلاینت).
 *
 * ترکیبی از دو سنت:
 *  - هفت مکتب دانشنامه فارسی پروژه (فضیلت، وظیفه، فایده، قرارداد، مراقبت، اگزیستانس، نیچه)
 *  - به‌علاوه «خیر مشترک» که در ادامه توضیح داده شده — مجموعاً هشت مکتب
 *  - منظر «خیر مشترک» از چارچوب مرکز Markkula دانشگاه سانتا کلارا،
 *    که در آن سنت جدا از عدالت رالزی شمرده می‌شود: عدالت درباره انصافِ توزیع است،
 *    خیر مشترک درباره شرایط و نهادهای مشترکی که همه از آن بهره می‌برند.
 */
export const SCHOOLS = [
  { key: 'virtue',         name: 'فضیلت‌گرایی',     thinker: 'ارسطو، مک‌اینتایر', question: 'انسان بافضیلت در این موقعیت چه می‌کرد؟',            icon: '🏛️', color: '#7c3aed' },
  { key: 'deontology',     name: 'وظیفه‌گرایی',     thinker: 'کانت، راس',         question: 'آیا می‌توان این کار را قانونی عام کرد؟ کرامت کسی نقض می‌شود؟', icon: '⚖️', color: '#2563eb' },
  { key: 'utilitarianism', name: 'فایده‌گرایی',     thinker: 'بنتام، میل، سینگر', question: 'کدام گزینه بیشترین خیر و کمترین رنج را می‌سازد؟',    icon: '📊', color: '#0d9488' },
  { key: 'commongood',     name: 'خیر مشترک',       thinker: 'سنت ارسطویی-رواقی', question: 'این تصمیم با شرایط مشترکِ زندگی جمعی چه می‌کند؟',    icon: '🏘️', color: '#0891b2' },
  { key: 'contractualism', name: 'قراردادگرایی',    thinker: 'رالز، اسکنلون',     question: 'پشت پرده جهل، چه قاعده‌ای را تصویب می‌کردید؟',       icon: '🤝', color: '#ea580c' },
  { key: 'care',           name: 'اخلاق مراقبت',    thinker: 'گیلیگان، نادینگز',  question: 'این تصمیم با آسیب‌پذیرترین فرد رابطه چه می‌کند؟',    icon: '🫂', color: '#db2777' },
  { key: 'existentialism', name: 'اگزیستانسیالیسم', thinker: 'کی‌یرکگور، کامو',   question: 'آیا مسئولیت اصیل این انتخاب را می‌پذیرید؟',          icon: '🕯️', color: '#65a30d' },
  { key: 'nietzsche',      name: 'تبارشناسی نیچه',  thinker: 'نیچه',              question: 'ریشه این ارزش شجاعت است یا ترس از قضاوت دیگران؟',   icon: '⛰️', color: '#b45309' }
];

/**
 * پنج مرحله فلوچارت پالایش تصمیم.
 * هر مرحله یک دروازه است به‌علاوه مکتب یا مکاتبی که آن را تغذیه می‌کنند.
 */
export const STAGES = [
  { key: 'dignity',      n: '۱', kind: 'veto',     title: 'دروازه کرامت',        thinker: 'ایمانوئل کانت',
    question: 'آیا در این تصمیم، انسانی صرفاً به ابزار تبدیل شده است؟',
    rule: 'وتوکننده — اگر کرامت کسی نقض شود، گزینه مردود است و باید حذف یا بازطراحی شود.',
    schools: ['deontology'] },

  { key: 'justice',      n: '۲', kind: 'veto',     title: 'دروازه عدالت',        thinker: 'جان رالز',
    question: 'پشت پرده جهل، آیا این تصمیم را عادلانه می‌دانستید؟',
    rule: 'وتوکننده — اگر بار تصمیم بر دوش محروم‌ترین طرف بیفتد، باید به سود او تعدیل شود.',
    schools: ['contractualism'] },

  { key: 'utility',      n: '۳', kind: 'optimize', title: 'فایده و خیر مشترک',   thinker: 'میل و سنت خیر مشترک',
    question: 'کدام گزینه بیشترین خیر جمعی را می‌سازد، و با شرایط مشترک زندگی جمعی چه می‌کند؟',
    rule: 'بهینه‌ساز — میان گزینه‌هایی که از دو دروازه بالا گذشته‌اند، بهترین را انتخاب می‌کند.',
    schools: ['utilitarianism', 'commongood'] },

  { key: 'carevirtue',   n: '۴', kind: 'optimize', title: 'مراقبت و فضیلت',      thinker: 'گیلیگان و ارسطو',
    question: 'نیاز عینی آسیب‌پذیرترین فرد چیست، و این تصمیم چه منشی می‌سازد؟',
    rule: 'بهینه‌ساز — شیوه اجرای تصمیم را انسانی و متناسب می‌کند.',
    schools: ['care', 'virtue'] },

  { key: 'authenticity', n: '۵', kind: 'refine',   title: 'اصالت و انگیزه',      thinker: 'کی‌یرکگور و نیچه',
    question: 'انگیزه این انتخاب شجاعت است یا ترس و همرنگی با جماعت؟',
    rule: 'پالایش‌کننده — تصمیم را از ریاکاری، ترس و خودفریبی پاک می‌کند.',
    schools: ['existentialism', 'nietzsche'] }
];

export const GATES = STAGES.map(s => ({ key: s.key, title: s.title, sub: s.thinker, type: s.kind, hint: s.rule }));

/** ستون‌های ماتریس مقایسه گزینه‌ها — ترتیب باید با دستور مدل یکی باشد */
export const MATRIX_COLUMNS = [
  { key: 'dignity',    label: 'کرامت' },
  { key: 'justice',    label: 'عدالت' },
  { key: 'utility',    label: 'فایده' },
  { key: 'commongood', label: 'خیر مشترک' },
  { key: 'care',       label: 'مراقبت' },
  { key: 'virtue',     label: 'فضیلت' },
  { key: 'authenticity', label: 'اصالت' }
];

/** همه کلیدهای بخش‌های خروجی مدل، به ترتیب روایت */
export const SECTION_KEYS = [
  'issue', 'reframe', 'facts', 'stakeholders', 'options', 'matrix',
  ...STAGES.flatMap(s => [`gate:${s.key}`, ...s.schools.map(k => `school:${k}`)]),
  'tensions', 'recommendation', 'test', 'implementation', 'questions', 'blindspots', 'revisit'
];
