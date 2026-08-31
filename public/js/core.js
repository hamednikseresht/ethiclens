/* ==========================================================================
   Ethic Lens — هسته مشترک کلاینت: تم، API، توست، مودال، مارک‌داون، پوسته صفحه
   ========================================================================== */

/* ---------------- تم ---------------- */
(function initTheme() {
  const saved = localStorage.getItem('theme');
  const theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

export function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  return next;
}

/* ---------------- ابزار ---------------- */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
export function faNum(n) {
  if (n === null || n === undefined || n === '') return '—';
  return String(n).replace(/[0-9]/g, d => FA_DIGITS[+d]);
}

export function faDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso;
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(d);
  } catch { return d.toLocaleString('fa-IR'); }
}

export function relTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'همین الان';
  if (diff < 3600) return `${faNum(Math.floor(diff / 60))} دقیقه پیش`;
  if (diff < 86400) return `${faNum(Math.floor(diff / 3600))} ساعت پیش`;
  if (diff < 604800) return `${faNum(Math.floor(diff / 86400))} روز پیش`;
  return faDate(iso);
}

export function duration(ms) {
  if (!ms) return '—';
  return ms < 1000 ? `${faNum(ms)} م‌ث` : `${faNum((ms / 1000).toFixed(1))} ثانیه`;
}

/* ---------------- توست ---------------- */
export function toast(message, kind = '') {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, kind === 'err' ? 5200 : 3200);
}

/* ---------------- API ---------------- */
export const state = { user: null, csrf: null, settings: {}, allowance: null };

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.csrf) headers['x-csrf-token'] = state.csrf;

  const res = await fetch(path, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin'
  });

  if (raw) return res;

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }

  if (!res.ok) {
    const err = new Error(data?.error || `خطای ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get:  (p)    => request(p),
  post: (p, b) => request(p, { method: 'POST', body: b ?? {} }),
  put:  (p, b) => request(p, { method: 'PUT',  body: b ?? {} }),
  del:  (p)    => request(p, { method: 'DELETE' }),
  raw:  request
};

/** بارگذاری نشست جاری؛ csrf را در state می‌گذارد */
export async function loadSession() {
  const data = await request('/api/auth/me');
  state.user = data.user;
  state.csrf = data.csrf;
  state.settings = data.settings || {};
  state.allowance = data.allowance || null;
  return state;
}

/** اگر کاربر وارد نشده، به صفحه ورود می‌فرستد */
export function requireUser(adminOnly = false) {
  if (!state.user) {
    location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search));
    return false;
  }
  if (adminOnly && state.user.role !== 'admin') {
    location.replace('/dashboard');
    return false;
  }
  return true;
}

/* ---------------- مارک‌داون سبک ---------------- */
export function md(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;   // 'ul' | 'ol' | null
  let para = [];

  const inline = t => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closePara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };

  for (const line of lines) {
    const t = line.trim();

    if (!t) { closePara(); closeList(); continue; }

    const ol = t.match(/^(\d+)[.)]\s+(.*)$/);
    const ul = t.match(/^[-*•–]\s+(.*)$/);
    const quote = t.match(/^>\s?(.*)$/);
    const head = t.match(/^(#{1,4})\s+(.*)$/);

    if (head) {
      closePara(); closeList();
      const lvl = Math.min(6, head[1].length + 2);
      out.push(`<h${lvl}>${inline(head[2])}</h${lvl}>`);
    } else if (ol) {
      closePara();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(ol[2])}</li>`);
    } else if (ul) {
      closePara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (quote) {
      closePara(); closeList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
    } else {
      closeList();
      para.push(t);
    }
  }
  closePara(); closeList();
  return out.join('');
}

/* ---------------- مودال ---------------- */
export function modal({ title, body, actions = [], onOpen }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">${esc(title)}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot"></div>
    </div>`;

  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };

  const foot = $('.modal-foot', backdrop);
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.className || ''}`;
    b.textContent = a.label;
    b.onclick = async () => {
      if (a.onClick) {
        b.disabled = true;
        try { const keep = await a.onClick(backdrop, b); if (keep !== 'keep') close(); }
        finally { b.disabled = false; }
      } else close();
    };
    foot.appendChild(b);
  }

  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  onOpen?.(backdrop, close);
  return { el: backdrop, close };
}

export function confirmDialog(title, message, confirmLabel = 'تأیید') {
  return new Promise(resolve => {
    modal({
      title,
      body: `<p style="font-size:.92rem;line-height:1.8">${esc(message)}</p>`,
      actions: [
        { label: confirmLabel, className: 'btn-danger', onClick: () => resolve(true) },
        { label: 'انصراف', onClick: () => resolve(false) }
      ]
    });
  });
}

/* ---------------- پوسته صفحه (نوار بالا) ---------------- */
const NAV = [
  { href: '/app',       label: 'تحلیل تازه' },
  { href: '/dashboard', label: 'داشبورد' },
  { href: '/history',   label: 'تاریخچه' },
  { href: '/explore',   label: 'تحلیل‌های عمومی' },
  { href: '/guide',     label: 'دانشنامه' },
  { href: '/about',     label: 'درباره ما' }
];

/**
 * ناوبری بازدیدکننده مهمان.
 * صفحه‌های عمومی باید برای خزنده موتور جست‌وجو پیوند داخلی داشته باشند،
 * پس حتی وقتی کسی وارد نشده هم مسیرهای عمومی نمایش داده می‌شوند.
 */
const PUBLIC_NAV = [
  { href: '/explore', label: 'تحلیل‌های عمومی' },
  { href: '/guide',   label: 'دانشنامه' },
  { href: '/about',   label: 'درباره ما' }
];

/**
 * نوار بالای صفحه — یکی برای همه صفحه‌ها.
 *
 * محتوایش بر اساس وضعیت کاربر تغییر می‌کند:
 *   مهمان        → مسیرهای عمومی + دکمه ورود و ثبت‌نام
 *   منتظر تأیید  → مسیرهای عمومی + نشان «در انتظار تأیید». مسیرهایی که
 *                  هنوز برایش باز نیست نشان داده نمی‌شوند تا به بن‌بست نخورد.
 *   تأییدشده     → همه مسیرها + منوی کاربر
 *   مدیر         → به‌علاوه پیوند پنل مدیریت
 */
export function renderTopbar(activePath) {
  const host = $('#topbar');
  if (!host) return;
  const path = activePath || location.pathname;
  const u = state.user;
  const approved = !!u && u.status === 'active';

  const links = (approved ? NAV : PUBLIC_NAV).map(n =>
    `<a href="${n.href}" class="${path === n.href ? 'active' : ''}">${n.label}</a>`
  ).join('');

  const adminLink = u?.role === 'admin'
    ? `<a href="/admin" class="${path === '/admin' ? 'active' : ''}">مدیریت</a>` : '';

  const right = u
    ? `${approved ? '' : '<span class="badge badge-warn tb-pending">در انتظار تأیید</span>'}
       <div class="usermenu">
         <button class="usermenu-btn" id="umBtn" aria-haspopup="true" aria-expanded="false">
           <span class="avatar">${esc((u.name || u.email)[0].toUpperCase())}</span>
           <span class="um-name">${esc(u.name)}</span>
         </button>
       </div>`
    : `<a href="/login" class="btn btn-sm">ورود</a>
       <a href="/login?mode=register" class="btn btn-primary btn-sm">ثبت‌نام</a>`;

  host.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="${approved ? '/app' : '/'}">
        <span class="brand-mark">EL</span><span class="brand-text">دیدگاه اخلاق</span>
      </a>
      <nav class="nav-links">${links}${adminLink}</nav>
      <div class="grow"></div>
      <button class="btn btn-icon btn-ghost" id="themeBtn" title="حالت شب / روز" aria-label="تغییر تم">◐</button>
      ${right}
    </div>`;

  $('#themeBtn', host).onclick = () => toggleTheme();

  const umBtn = $('#umBtn', host);
  if (umBtn) {
    umBtn.onclick = e => {
      e.stopPropagation();
      const existing = $('.usermenu-pop', host);
      if (existing) { existing.remove(); umBtn.setAttribute('aria-expanded', 'false'); return; }
      const pop = document.createElement('div');
      pop.className = 'usermenu-pop';
      pop.innerHTML = `
        <div class="usermenu-head">
          <strong>${esc(u.name)}</strong>
          <span>${esc(u.email)}</span>
        </div>
        <a href="/settings">⚙️ تنظیمات حساب</a>
        ${u.role === 'admin' ? '<a href="/admin">🛡️ پنل مدیریت</a>' : ''}
        <button id="logoutBtn">↩️ خروج از حساب</button>`;
      umBtn.parentElement.appendChild(pop);
      umBtn.setAttribute('aria-expanded', 'true');
      $('#logoutBtn', pop).onclick = async () => {
        try { await api.post('/api/auth/logout'); } catch {}
        location.href = '/login';
      };
      setTimeout(() => document.addEventListener('click', function once() {
        pop.remove(); umBtn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', once);
      }, { once: true }), 0);
    };
  }
}

/* ---------------- نوار وضعیت حساب ---------------- */
/**
 * اگر حساب هنوز تأیید نشده، نواری بالای صفحه نشان می‌دهد.
 * روی هر صفحه‌ای که boot() صدا زده شود خودکار ظاهر می‌شود.
 */
export function mountStatusBanner() {
  if (!state.user || state.user.status === 'active') return;

  const bar = document.createElement('div');
  bar.className = 'status-bar';
  bar.innerHTML = `
    <span class="status-ic">⏳</span>
    <span class="grow">
      <strong>حساب شما در انتظار تأیید مدیر است.</strong>
      ثبت‌نامتان ثبت شده و در نوبت بررسی است. تا زمان تأیید، امکان اجرای تحلیل وجود ندارد —
      نتیجه بررسی به <span class="mono">${esc(state.user.email)}</span> اطلاع داده می‌شود.
    </span>`;

  document.body.insertBefore(bar, document.body.firstChild);
}

/* ---------------- دکمه بازگشت به بالا ---------------- */
export function mountBackToTop() {
  const b = document.createElement('button');
  b.className = 'fab';
  b.innerHTML = '↑';
  b.title = 'بازگشت به بالا';
  b.setAttribute('aria-label', 'بازگشت به بالا');
  b.onclick = () => scrollTo({ top: 0, behavior: 'smooth' });
  document.body.appendChild(b);
  addEventListener('scroll', () => b.classList.toggle('show', scrollY > 500), { passive: true });
}

/* ---------------- راه‌انداز صفحه ---------------- */
export async function boot({ auth = true, admin = false } = {}) {
  try {
    await loadSession();
  } catch (e) {
    console.error('نشست بارگذاری نشد', e);
  }
  if (auth && !requireUser(admin)) return false;
  renderTopbar();
  mountBackToTop();
  mountStatusBanner();
  return true;
}
