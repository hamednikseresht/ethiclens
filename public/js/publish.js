/* ==========================================================================
   Publishing and sharing a finished analysis.

   Lives in its own module because two pages need it: the analysis detail
   page and the bar shown the moment a fresh analysis finishes. Keeping one
   copy means the privacy warning cannot drift out of sync between them —
   that warning is the only thing standing between a user and accidentally
   indexing a personal dilemma on Google.
   ========================================================================== */
import { esc, faNum, api, toast, modal } from './core.js';
import { SECTION_LABELS } from './result.js';

/* --------------------------------------------------------------------------
   Completeness banner.

   Names the specific blocks that did not arrive rather than saying
   "something is missing", because the user needs to know whether they lost a
   peripheral lens or the actual recommendation before deciding to re-run.

   `retry` is opt-in: on the analysis page there is no form to resubmit, so
   offering the button there would lead nowhere.
   -------------------------------------------------------------------------- */
export function gapsMarkup(c, { retry = false } = {}) {
  if (!c || c.complete) return '';

  const gaps = [...(c.missing || []), ...(c.thin || [])];
  const names = gaps.map(k => SECTION_LABELS[k] || k);
  const critical = c.severity === 'critical';

  return `
    <div class="gaps" data-sev="${esc(c.severity)}">
      <b>${critical ? '⚠ بخش‌های کلیدی جا مانده‌اند' : 'برخی بخش‌ها کامل نشدند'}</b>
      مدل ${faNum(c.present)} بخش از ${faNum(c.total)} بخش را برگرداند.
      ${c.truncated
        ? 'پاسخ به سقف توکن خورد و بریده شد — مدیر می‌تواند سقف را در تنظیمات بالا ببرد.'
        : 'این معمولاً یعنی پاسخ وسط کار بریده شده است.'}
      <ul>${names.slice(0, 8).map(n => `<li>${esc(n)}</li>`).join('')}
          ${names.length > 8 ? `<li>و ${faNum(names.length - 8)} بخش دیگر</li>` : ''}</ul>
      ${retry ? '<div class="gaps-act"><button class="btn btn-sm btn-primary" id="retryGaps">دوباره تحلیل کن</button></div>' : ''}
    </div>`;
}

/** Absolute public URL for a published analysis. */
export function publicUrl(slug) {
  return location.origin + '/a/' + encodeURIComponent(slug);
}

/**
 * Split pasted tag text the same way the server does.
 *
 * Duplicated rather than fetched because it drives a live preview on every
 * keystroke, and a round trip per character would be absurd. The server still
 * re-splits what arrives — this copy is for showing, not for trusting. Both
 * accept the Persian comma as well as the Latin one, since which one appears
 * depends on the keyboard the text was typed with.
 */
export function splitTags(input) {
  const seen = new Set();
  const out = [];
  for (const raw of String(input || '').split(/[,،؛;\n\r]+/)) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

/* --------------------------------------------------------------------------
   Share targets.

   Telegram and WhatsApp come first deliberately: they are how this audience
   actually shares links. The native share sheet is offered only when the
   browser really has one, since on desktop navigator.share is usually absent
   and a dead button is worse than no button.
   -------------------------------------------------------------------------- */
const TARGETS = [
  { key: 'telegram', label: 'تلگرام',  icon: '✈️',
    url: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: 'whatsapp', label: 'واتس‌اپ', icon: '💬',
    url: (u, t) => `https://wa.me/?text=${encodeURIComponent(t + ' ' + u)}` },
  { key: 'x',        label: 'ایکس',    icon: '𝕏',
    url: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: 'email',    label: 'ایمیل',   icon: '✉️',
    url: (u, t) => `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(u)}` }
];

export function shareMarkup(url, title) {
  const links = TARGETS.map(t => `
    <a class="share-btn" href="${esc(t.url(url, title))}" target="_blank" rel="noopener"
       data-share="${t.key}" title="${esc(t.label)}">
      <span aria-hidden="true">${t.icon}</span><span>${esc(t.label)}</span>
    </a>`).join('');

  return `
    <div class="share-row">
      <button class="share-btn" data-share="copy"><span aria-hidden="true">🔗</span><span>کپی نشانی</span></button>
      ${links}
      ${navigator.share ? '<button class="share-btn" data-share="native"><span aria-hidden="true">📤</span><span>اشتراک‌گذاری</span></button>' : ''}
    </div>`;
}

export function wireShare(host, url, title) {
  if (!host) return;

  host.querySelector('[data-share="copy"]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('نشانی کپی شد.', 'ok');
    } catch {
      // Clipboard access fails on insecure origins and in some mobile
      // browsers. Falling back to a selectable prompt beats a dead button.
      window.prompt('نشانی را کپی کنید:', url);
    }
  });

  host.querySelector('[data-share="native"]')?.addEventListener('click', async () => {
    try { await navigator.share({ title, url }); }
    catch { /* user dismissed the sheet — not an error */ }
  });
}

/* --------------------------------------------------------------------------
   The published-state strip: shown once an analysis is public.
   -------------------------------------------------------------------------- */
export function pubStateMarkup(analysis) {
  if (!analysis.is_public || !analysis.slug) return '';
  const url = publicUrl(analysis.slug);
  const title = analysis.public_title || analysis.title || 'تحلیل اخلاقی';

  return `
    <div class="pub-state no-print">
      <span aria-hidden="true">🌐</span>
      <span class="grow">این تحلیل عمومی است: <code>${esc(url)}</code></span>
      <a class="btn btn-sm" href="/a/${encodeURIComponent(analysis.slug)}" target="_blank" rel="noopener">دیدن صفحه</a>
    </div>
    ${shareMarkup(url, title)}`;
}

export function wirePubState(host, analysis) {
  if (!host || !analysis.is_public || !analysis.slug) return;
  wireShare(host, publicUrl(analysis.slug), analysis.public_title || analysis.title || 'تحلیل اخلاقی');
}

/* --------------------------------------------------------------------------
   The publish dialog.

   `analysis` is mutated in place on success so the caller's copy stays
   truthful; `onChange` then lets the page re-render whatever it needs to.
   -------------------------------------------------------------------------- */
export function openPublishDialog(analysis, onChange) {
  if (analysis.is_public) return openUnpublishDialog(analysis, onChange);

  const c = analysis.completeness;
  const incomplete = c && !c.complete;

  /* The editorial block appears only when the server sent a category list,
     which it does only for admins. A normal user keeps the short form: the
     extra fields are decisions about how the site ranks, not about their own
     dilemma, and asking them would be noise. */
  const cats = Array.isArray(analysis.categories) ? analysis.categories : null;
  const editorial = cats ? `
    <div class="pub-editorial">
      <div class="pub-editorial-head">تنظیمات انتشار (مدیر)</div>
      <div class="field">
        <label for="pc">دسته‌بندی</label>
        <select class="select" id="pc">
          <option value="">— بدون دسته‌بندی —</option>
          ${cats.map(k => `<option value="${k.id}" ${analysis.category_id === k.id ? 'selected' : ''}>${esc(k.title)}</option>`).join('')}
        </select>
        ${cats.length ? '' : '<span class="hint">هنوز دسته‌بندی نساخته‌اید — پنل مدیریت ← دسته‌بندی‌ها.</span>'}
      </div>
      <div class="field">
        <label for="pslug">نشانی صفحه (URL Slug)</label>
        <input class="input mono" id="pslug" maxlength="70" dir="ltr"
               value="${esc(analysis.slug || '')}"
               ${analysis.slug ? 'disabled' : ''}
               placeholder="اگر خالی بماند از عنوان ساخته می‌شود">
        <span class="hint">${analysis.slug
          ? 'نشانی پس از اولین انتشار قفل می‌شود تا پیوندهای موجود نشکنند.'
          : 'فقط یک بار قابل تعیین است؛ پس از انتشار تغییر نمی‌کند.'}</span>
      </div>
      <div class="field">
        <label for="pseo">عنوان سئو</label>
        <input class="input" id="pseo" maxlength="70" value="${esc(analysis.seo_title || '')}"
               placeholder="عنوانی که در نتیجه گوگل دیده می‌شود">
        <span class="hint">حدود ۶۰ نویسه بهترین است. خالی بماند، از عنوان عمومی استفاده می‌شود.</span>
      </div>
      <div class="field">
        <label for="ph1">تیتر اصلی صفحه (H1)</label>
        <input class="input" id="ph1" maxlength="120" value="${esc(analysis.h1 || '')}"
               placeholder="تیتری که بالای صفحه دیده می‌شود">
        <span class="hint">می‌تواند با عنوان سئو فرق کند — این را خواننده‌ای می‌بیند که همین حالا وارد صفحه شده.</span>
      </div>
      <div class="field">
        <label for="ptags">تگ‌ها</label>
        <input class="input" id="ptags" value="${esc((analysis.tags || []).join('، '))}"
               placeholder="اخلاق کار، صداقت، تعارض منافع">
        <span class="hint">با کاما جدا کنید — چه فارسی «،» چه لاتین «,».</span>
        <div class="tag-preview" id="tagPreview"></div>
      </div>
    </div>` : '';

  modal({
    title: 'انتشار عمومی این تحلیل',
    body: `
      <div class="alert alert-warn" style="font-size:.86rem">
        <strong>پیش از انتشار بخوانید:</strong> متن دوراهی همان‌طور که نوشته‌اید در صفحه عمومی
        دیده می‌شود و موتورهای جست‌وجو آن را ایندکس می‌کنند. اگر نام افراد، نام شرکت یا
        جزئیات قابل‌شناسایی در متن هست، پیش از انتشار عنوان و خلاصه عمومی را طوری بنویسید
        که کسی شناسایی نشود — یا اصلاً منتشرش نکنید.
      </div>
      ${incomplete ? `
        <div class="alert alert-danger" style="font-size:.86rem">
          <strong>این تحلیل ناقص است.</strong> ${esc(incompleteSummary(c))}
          می‌توانید منتشرش کنید، ولی صفحه عمومی هم همین کاستی را نشان می‌دهد.
          بهتر است اول دوباره تحلیل کنید.
        </div>` : ''}
      <div class="field"><label for="pt">عنوان عمومی</label>
        <input class="input" id="pt" maxlength="120" value="${esc(analysis.public_title || analysis.title || '')}">
        <span class="hint">همین عنوان در نتایج گوگل نمایش داده می‌شود.</span></div>
      <div class="field"><label for="ps">خلاصه عمومی</label>
        <textarea class="textarea" id="ps" rows="3" maxlength="300"
          placeholder="اگر خالی بگذارید، از بازخوانی مسئله ساخته می‌شود.">${esc(analysis.public_summary || '')}</textarea>
        <span class="hint">توضیح زیر عنوان در نتایج جست‌وجو — حدود ۱۵۰ نویسه بهترین است.</span></div>
      <div class="field"><label for="pa">نام نویسنده (اختیاری)</label>
        <input class="input" id="pa" maxlength="60" placeholder="خالی بگذارید تا ناشناس منتشر شود"
               value="${esc(analysis.public_author || '')}">
        <span class="hint">ایمیل و حساب کاربری شما هرگز نمایش داده نمی‌شود.</span></div>
      ${editorial}`,
    onOpen: root => {
      // Live preview of how the pasted text splits, so the editor sees the
      // separator being honoured instead of guessing and publishing one long
      // tag by mistake.
      const input = root.querySelector('#ptags');
      const out = root.querySelector('#tagPreview');
      if (!input || !out) return;
      const draw = () => {
        const tags = splitTags(input.value);
        out.innerHTML = tags.length
          ? tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')
          : '<span class="hint">هنوز تگی وارد نشده.</span>';
      };
      input.addEventListener('input', draw);
      draw();
    },
    actions: [
      { label: 'انتشار عمومی', className: 'btn-primary', onClick: async root => {
          const titleField = root.querySelector('#pt');
          try {
            const body = {
              publish: true,
              public_title:   titleField.value,
              public_summary: root.querySelector('#ps').value,
              public_author:  root.querySelector('#pa').value
            };
            // Present only for admins; a normal user never sends these.
            if (root.querySelector('#pc')) {
              body.category_id = root.querySelector('#pc').value || null;
              body.seo_title   = root.querySelector('#pseo').value;
              body.h1          = root.querySelector('#ph1').value;
              body.tags        = root.querySelector('#ptags').value;
              const sl = root.querySelector('#pslug');
              if (sl && !sl.disabled) body.slug = sl.value;
            }
            const r = await api.post(`/api/history/${analysis.id}/publish`, body);
            Object.assign(analysis, {
              is_public: 1, slug: r.slug,
              public_title: r.public_title,
              public_summary: r.public_summary,
              public_author: r.public_author,
              category_id: r.category_id, seo_title: r.seo_title,
              h1: r.h1, tags: r.tags
            });
            toast('منتشر شد.', 'ok');
            onChange?.(analysis);
          } catch (e) {
            // A taken title is the one failure the user can fix right here,
            // so the dialog stays open with the field selected rather than
            // making them reopen it and retype what they wrote.
            toast(e.message, 'err');
            if (/عنوان/.test(e.message)) {
              let warn = root.querySelector('#ptTaken');
              if (!warn) {
                warn = document.createElement('span');
                warn.id = 'ptTaken';
                warn.className = 'hint';
                warn.style.color = 'var(--danger)';
                titleField.insertAdjacentElement('afterend', warn);
              }
              warn.textContent = 'این عنوان قبلاً استفاده شده — عنوان دیگری بنویسید.';
              titleField.focus();
              titleField.select();
            }
            return 'keep';
          }
        } },
      { label: 'انصراف' }
    ]
  });
}

function openUnpublishDialog(analysis, onChange) {
  modal({
    title: 'این تحلیل عمومی است',
    body: `<p style="font-size:.9rem;line-height:1.9">
             نشانی عمومی: <code style="direction:ltr;display:inline-block">/a/${esc(analysis.slug)}</code><br><br>
             اگر آن را از حالت عمومی خارج کنید، صفحه دیگر در دسترس نخواهد بود؛ ولی نشانی محفوظ می‌ماند
             تا اگر بعداً دوباره منتشرش کردید همان لینک کار کند.
           </p>
           ${shareMarkup(publicUrl(analysis.slug), analysis.public_title || analysis.title || '')}`,
    onOpen: root => wireShare(root, publicUrl(analysis.slug), analysis.public_title || analysis.title || ''),
    actions: [
      { label: 'خارج‌کردن از حالت عمومی', className: 'btn-danger', onClick: async () => {
          try {
            await api.post(`/api/history/${analysis.id}/publish`, { publish: false });
            analysis.is_public = 0;
            toast('از حالت عمومی خارج شد.', 'ok');
            onChange?.(analysis);
          } catch (e) { toast(e.message, 'err'); return 'keep'; }
        } },
      { label: 'بستن' }
    ]
  });
}

/** Human-readable summary of what a completeness report found. */
export function incompleteSummary(c) {
  if (!c || c.complete) return '';
  const gaps = [...(c.missing || []), ...(c.thin || [])];
  return `${gaps.length} بخش از ${c.total} بخش کامل نشده است.`;
}
