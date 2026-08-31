/**
 * ساخت public/pages/guide.html از روی فایل اصلی ethic_2.html
 *  - حذف وابستگی به CDN مرمید (خلاف سیاست CSP) و جایگزینی با فلوچارت HTML بومی
 *  - افزودن نوار پیمایش برنامه
 *  - همگام‌سازی تم با بقیه سامانه (همان کلید localStorage)
 *
 * اجرا:  node scripts/build-guide.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'ethic_2.html');
const OUT = path.join(ROOT, 'public', 'pages', 'guide.html');

let html = fs.readFileSync(SRC, 'utf8');

/* ---- ۱. حذف اسکریپت مرمید ---- */
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid[^<]*<\/script>\s*/g, '');
// دکمه تم خودِ دانشنامه حذف می‌شود؛ نوار مشترک دکمه خودش را دارد
html = html.replace(/<button class="theme-toggle"[\s\S]*?<\/button>/, '');
html = html.replace(/\s*\/\/ راه‌اندازی Mermaid[\s\S]*?\}\);\n/, '\n');

/* ---- ۲. جایگزینی بلوک مرمید با فلوچارت بومی ---- */
const FLOW = `<div class="flow-native">
            <div class="flow-node flow-start">⚡ شروع: مواجهه با دوراهی اخلاقی</div>
            <div class="flow-link">↓</div>

            <div class="flow-step">
              <div class="flow-node flow-gate">۱. آزمون کرامت کانت — آیا انسان‌ها ابزار شده‌اند؟</div>
              <div class="flow-branches">
                <div class="flow-branch flow-bad"><span class="flow-label">بله، نقض کرامت</span>
                  ⛔ توقف: گزینه نامشروع است و باید حذف یا بازطراحی شود</div>
                <div class="flow-branch flow-good"><span class="flow-label">خیر، حفظ شأن</span>
                  ادامه به دروازه بعدی</div>
              </div>
            </div>
            <div class="flow-link">↓</div>

            <div class="flow-step">
              <div class="flow-node flow-gate">۲. آزمون عدالت رالز — آیا به محرومان ستم می‌شود؟</div>
              <div class="flow-branches">
                <div class="flow-branch flow-warn"><span class="flow-label">بله، نابرابری ظالمانه</span>
                  ⚠️ تعدیل تصمیم به سود ضعیف‌ترین طرف، سپس ادامه</div>
                <div class="flow-branch flow-good"><span class="flow-label">خیر، منصفانه</span>
                  ادامه به محاسبه فایده</div>
              </div>
            </div>
            <div class="flow-link">↓</div>

            <div class="flow-node flow-calc">۳. فایده‌گرایی میل — کدام گزینه کمترین رنج و بیشترین خیر جمعی را دارد؟</div>
            <div class="flow-link">↓</div>

            <div class="flow-node flow-action">۴. مراقبت و فضیلت ارسطو — پاسخ به نیاز عینی افراد و منشِ شایسته</div>
            <div class="flow-link">↓</div>

            <div class="flow-step">
              <div class="flow-node flow-gate">۵. آزمون اصالت و تبارشناسی — انگیزه از سر شجاعت است یا ترس؟</div>
              <div class="flow-branches">
                <div class="flow-branch flow-warn"><span class="flow-label">ناشی از ترس و تظاهر</span>
                  🔄 بازگشت به گام ۴ و بازنگری در انگیزه</div>
                <div class="flow-branch flow-good"><span class="flow-label">انتخابی اصیل و آگاهانه</span>
                  ادامه به تصمیم نهایی</div>
              </div>
            </div>
            <div class="flow-link">↓</div>

            <div class="flow-node flow-final">✅ اتخاذ تصمیم نهایی و موجه</div>
          </div>`;

html = html.replace(
  /<div class="mermaid-scroll">[\s\S]*?<\/div>\s*<\/div>/,
  `<div class="mermaid-scroll">\n          ${FLOW}\n        </div>`
);

/* ---- ۳. سبک فلوچارت بومی + نوار پیمایش ---- */
const EXTRA_CSS = `
  /* --- فلوچارت بومی (جایگزین مرمید) --- */
  .mermaid-scroll{display:block;overflow:visible}
  .flow-native{display:flex;flex-direction:column;align-items:stretch;gap:.35rem;max-width:640px;margin:0 auto}
  .flow-node{
    border-radius:12px;padding:.85rem 1rem;font-size:.88rem;font-weight:700;line-height:1.7;
    text-align:center;border:2px solid var(--border-color);background:var(--bg-subtle);color:var(--text-main);
  }
  .flow-start,.flow-final{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:800}
  .flow-final{background:var(--accent);border-color:var(--accent)}
  .flow-gate{background:var(--bg-surface);border-color:var(--primary)}
  .flow-calc{background:var(--primary-light);border-color:var(--primary);color:var(--primary)}
  .flow-action{background:var(--accent-light);border-color:var(--accent);color:var(--accent)}
  .flow-link{text-align:center;color:var(--text-muted);font-size:1.1rem;line-height:1}
  .flow-step{display:flex;flex-direction:column;gap:.35rem}
  .flow-branches{display:grid;grid-template-columns:1fr;gap:.35rem;padding-inline-start:1rem;
                 border-inline-start:2px dashed var(--border-color);margin-inline-start:1rem}
  @media (min-width:620px){.flow-branches{grid-template-columns:1fr 1fr;border:none;padding:0;margin:0}}
  .flow-branch{
    border-radius:10px;padding:.7rem .85rem;font-size:.82rem;line-height:1.65;
    border:1px solid var(--border-color);background:var(--bg-subtle);
  }
  .flow-label{display:block;font-size:.72rem;font-weight:800;margin-bottom:.2rem;opacity:.85}
  .flow-good{background:var(--accent-light);border-color:var(--accent);color:var(--text-main)}
  .flow-good .flow-label{color:var(--accent)}
  .flow-warn{background:var(--warning-bg);border-color:var(--warning-border)}
  .flow-warn .flow-label{color:var(--warning-border)}
  .flow-bad{background:var(--danger-bg);border-color:var(--danger-border)}
  .flow-bad .flow-label{color:var(--danger-border)}

`;

html = html.replace('</style>', EXTRA_CSS + '\n</style>');

/* ---- ۴. نوار بالای مشترک ---- */
// app.css و motion.css پس از سبک خود دانشنامه می‌آیند تا نوار
// دقیقاً مثل بقیه صفحه‌ها رنگ و رفتار بگیرد.
html = html.replace('</head>',
  '<link rel="stylesheet" href="/css/app.css">\n' +
  '<link rel="stylesheet" href="/css/motion.css">\n' +
  '</head>');

html = html.replace('<body>', '<body>\n<header class="topbar" id="topbar"></header>');

// نوار را همان هسته مشترک می‌سازد، پس وضعیت ورود کاربر را نشان می‌دهد
html = html.replace('</body>',
  '<script type="module">\n' +
  "  import { boot } from '/js/core.js';\n" +
  '  await boot({ auth: false });\n' +
  '</script>\n</body>');

/* ---- ۵. عنوان و پیوند برگشت در پانوشت ---- */
html = html.replace(
  /<footer>[\s\S]*?<\/footer>/,
  `<footer>
    <p>دانشنامه کاربردی فلسفه اخلاق — بخشی از سامانه EthicLens</p>
    <p style="margin-top:.4rem"><a href="/about" style="color:var(--primary)">درباره سازندگان</a></p>
    <p style="margin-top:.5rem"><a href="/app" style="color:var(--primary);font-weight:700">بازگشت به ابزار تحلیل ←</a></p>
  </footer>`
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log(`[guide] ساخته شد: ${path.relative(ROOT, OUT)} (${(html.length / 1024).toFixed(1)} کیلوبایت)`);

if (html.includes('mermaid.min.js')) console.warn('[guide] هشدار: ارجاع به مرمید هنوز باقی است.');
if (!html.includes('flow-native')) console.warn('[guide] هشدار: فلوچارت بومی جایگزین نشد.');
