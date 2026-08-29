// هفت مکتب اخلاقی + دروازه‌های فلوچارت تصمیم — مرجع مشترک سرور و کلاینت
export const SCHOOLS = [
  { key: 'virtue',         name: 'فضیلت‌گرایی',        thinker: 'ارسطو، مک‌اینتایر',  question: 'انسان بافضیلت در این موقعیت چه می‌کرد؟',       icon: '🏛️', color: '#7c3aed' },
  { key: 'deontology',     name: 'وظیفه‌گرایی',        thinker: 'کانت، راس',           question: 'آیا می‌توان این کار را قانونی عام کرد؟ کرامت کسی نقض می‌شود؟', icon: '⚖️', color: '#2563eb' },
  { key: 'utilitarianism', name: 'فایده‌گرایی',        thinker: 'بنتام، میل، سینگر',   question: 'کدام گزینه بیشترین خیر و کمترین رنج را می‌سازد؟', icon: '📊', color: '#0d9488' },
  { key: 'contractualism', name: 'قراردادگرایی',       thinker: 'رالز، اسکنلون',       question: 'پشت پرده جهل، چه قاعده‌ای را تصویب می‌کردید؟',   icon: '🤝', color: '#ea580c' },
  { key: 'care',           name: 'اخلاق مراقبت',       thinker: 'گیلیگان، نادینگز',    question: 'این تصمیم با آسیب‌پذیرترین فرد رابطه چه می‌کند؟',  icon: '🫂', color: '#db2777' },
  { key: 'existentialism', name: 'اگزیستانسیالیسم',    thinker: 'کی‌یرکگور، کامو',     question: 'آیا مسئولیت اصیل این انتخاب را می‌پذیرید؟',      icon: '🕯️', color: '#65a30d' },
  { key: 'nietzsche',      name: 'تبارشناسی نیچه',     thinker: 'نیچه',                question: 'ریشه این ارزش شجاعت است یا ترس از قضاوت دیگران؟', icon: '⛰️', color: '#b45309' }
];

export const GATES = [
  { key: 'dignity',      title: 'دروازه ۱ — کرامت (کانت)',        type: 'veto',      hint: 'اگر انسانی صرفاً ابزار شده باشد، گزینه مردود است.' },
  { key: 'justice',      title: 'دروازه ۲ — عدالت (رالز)',        type: 'veto',      hint: 'اگر به محروم‌ترین قشر ستم شود، تصمیم باید تعدیل شود.' },
  { key: 'utility',      title: 'دروازه ۳ — فایده (میل)',         type: 'optimize',  hint: 'سنجش سود و رنج جمعی میان گزینه‌ها.' },
  { key: 'carevirtue',   title: 'دروازه ۴ — مراقبت و فضیلت',      type: 'optimize',  hint: 'پاسخ به نیاز عینی افراد و منش عامل.' },
  { key: 'authenticity', title: 'دروازه ۵ — اصالت و انگیزه',      type: 'refine',    hint: 'آیا انگیزه شجاعت است یا ترس و همرنگی؟' }
];

export const SECTION_KEYS = [
  'reframe', 'stakeholders', 'options',
  ...SCHOOLS.map(s => `school:${s.key}`),
  ...GATES.map(g => `gate:${g.key}`),
  'tensions', 'recommendation', 'questions', 'blindspots'
];
