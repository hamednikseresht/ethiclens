/* ==========================================================================
   Ethic Lens — shared core for the server-rendered pages:
   theme, API, toasts, markdown and the top bar
   ========================================================================== */

/* ---------------- Theme ---------------- */
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

/* ---------------- Utilities ---------------- */
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

export function duration(ms) {
  if (!ms) return '—';
  return ms < 1000 ? `${faNum(ms)} م‌ث` : `${faNum((ms / 1000).toFixed(1))} ثانیه`;
}

/* ---------------- Toasts ---------------- */
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

/** Load the current session; puts csrf into state */
export async function loadSession() {
  const data = await request('/api/auth/me');
  state.user = data.user;
  state.csrf = data.csrf;
  state.settings = data.settings || {};
  state.allowance = data.allowance || null;
  return state;
}

/** Redirect to the login page when the user is not signed in */
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

/* ---------------- Lightweight markdown ---------------- */
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

/* ---------------- Page shell (top bar) ---------------- */
const NAV = [
  { href: '/',          label: 'تحلیل تازه' },
  { href: '/dashboard', label: 'داشبورد' },
  { href: '/history',   label: 'تاریخچه' },
  { href: '/explore',   label: 'تحلیل‌های عمومی' },
  { href: '/guide',     label: 'دانشنامه' },
  { href: '/about',     label: 'درباره ما' }
];

/**
 * Navigation for a guest visitor.
 *
 * Public pages need internal links for search-engine crawlers, so the public
 * routes are shown even when nobody is signed in — and they have to be the
 * server-rendered ones. /explore and /guide belong to the application now: a
 * crawler following them would get a shell marked noindex, and a guest would
 * get a login form instead of the page they were promised.
 */
const PUBLIC_NAV = [
  { href: '/p',     label: 'تحلیل‌های عمومی' },
  { href: '/g',     label: 'دانشنامه' },
  { href: '/about', label: 'درباره ما' }
];

/**
 * The page top bar — one for every page.
 *
 * Its contents change with the user's state:
 *   guest     → public routes + sign-in and sign-up buttons
 *   pending   → public routes + an "awaiting approval" badge. Routes not yet
 *               open to them are hidden, so they cannot walk into a dead end.
 *   approved  → every route + the user menu
 *   admin     → plus a link to the admin panel
 */
/**
 * The narrow-screen navigation drawer.
 *
 * Below the CSS breakpoint the nav links live in a panel behind the menu
 * button instead of on the bar. The open state is held in one place — the
 * button's aria-expanded — so the accessible state and the visual state
 * cannot disagree.
 */
function wireNavDrawer(host) {
  const btn = $('#navBtn', host);
  const panel = $('#navPanel', host);
  if (!btn || !panel) return;

  const drawerMode = matchMedia('(max-width:899px)');
  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';

  // Only the open/closed state is tracked here. Whether the closed panel is
  // reachable by keyboard is settled in CSS by `visibility`, tied to the same
  // media query that creates the drawer — so the two can never disagree.
  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('open', open);
  };

  btn.addEventListener('click', e => {
    e.stopPropagation();
    setOpen(!isOpen());
  });

  // Following a link navigates anyway, but closing first avoids the drawer
  // flashing on pages that render without a full reload.
  panel.addEventListener('click', e => {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('click', e => {
    if (isOpen() && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      btn.focus();
    }
  });

  // Crossing between layouts must reset the state: otherwise the panel keeps
  // its `open` class and reappears the next time the window narrows, and the
  // links would stay inert after switching to the wide bar.
  // Missing this event is now cosmetic rather than a correctness problem:
  // the widened bar shows its links either way, and the stale `open` class
  // only matters if the window narrows again.
  drawerMode.addEventListener?.('change', () => setOpen(false));
}

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
      <a class="brand" href="/">
        <span class="brand-mark">EL</span><span class="brand-text">دیدگاه اخلاق</span>
      </a>
      <nav class="nav-links" id="navPanel">${links}${adminLink}</nav>
      <div class="grow"></div>
      <button class="btn btn-icon btn-ghost" id="themeBtn" title="حالت شب / روز" aria-label="تغییر تم">◐</button>
      ${right}
      <button class="burger" id="navBtn" aria-expanded="false" aria-controls="navPanel" aria-label="فهرست مسیرها">
        <span></span><span></span><span></span>
      </button>
    </div>`;

  $('#themeBtn', host).onclick = () => toggleTheme();
  wireNavDrawer(host);

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

/* ---------------- Account status bar ---------------- */
/**
 * Shows a bar at the top of the page while an account is unapproved.
 * Appears automatically on any page that calls boot().
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

/* ---------------- Back-to-top button ---------------- */
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

/* ---------------- Page bootstrap ---------------- */
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
