/**
 * آزمون ویرایشگر دانشنامه: فهرست، ویرایش، بازگرداندن، ساخت، حذف و دسترسی.
 * اجرا:  node scripts/guide-flow.mjs
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const jar = new Map();

async function req(p, o = {}) {
  const h = { Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') };
  if (o.body !== undefined) h['Content-Type'] = 'application/json';
  if (o.csrf) h['x-csrf-token'] = o.csrf;
  const r = await fetch(BASE + p, {
    method: o.method || 'GET', headers: h,
    body: o.body === undefined ? undefined : JSON.stringify(o.body)
  });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const t = await r.text();
  try { return { s: r.status, d: JSON.parse(t) }; } catch { return { s: r.status, d: t }; }
}

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log(`  ✗ ${n}  → ${x}`)); };

let me = await req('/api/auth/me');
const login = await req('/api/auth/login', {
  method: 'POST', csrf: me.d.csrf,
  body: { email: process.env.ADMIN_EMAIL || 'admin@example.com',
          password: process.env.ADMIN_PASSWORD || 'ChangeMe123!' }
});
const csrf = login.d.csrf;
ok('ورود مدیر', login.s === 200);

console.log('\n── فهرست ──');
const list = await req('/api/admin/guide');
ok('GET /api/admin/guide', list.s === 200 && list.d.items.length > 0, `${list.d.items?.length} بخش`);
ok('گروه‌بندی بر اساس نوع', Object.keys(list.d.byKind).length === 5, JSON.stringify(list.d.counts));
ok('پرچم ویرایش‌شدگی', list.d.items.every(i => 'modified' in i));

console.log('\n── ویرایش و بازگرداندن ──');
const lens = list.d.items.find(i => i.kind === 'lens');
const origTitle = lens.title, origBody = lens.body;

const upd = await req(`/api/admin/guide/${lens.id}`, {
  method: 'PUT', csrf,
  body: { title: origTitle + ' (آزمایشی)', body: origBody + '\n\nپاراگراف آزمایشی.' }
});
ok('ویرایش بخش', upd.s === 200 && upd.d.section.modified === true);

const pub = await req('/api/guide');
ok('تغییر در API عمومی دیده می‌شود',
   pub.d.lenses.some(l => l.title.includes('آزمایشی')));
ok('مفاهیم پس از ویرایش حفظ می‌شوند',
   pub.d.lenses.find(l => l.id === lens.id)?.extra.concepts?.length === lens.extra.concepts.length);

const reset = await req(`/api/admin/guide/${lens.id}/reset`, { method: 'POST', csrf });
ok('بازگرداندن به متن کارخانه', reset.s === 200 && reset.d.section.title === origTitle);
ok('متن هم بازگشت', reset.d.section.body === origBody);

console.log('\n── ساخت و حذف ──');
const created = await req('/api/admin/guide', {
  method: 'POST', csrf, body: { kind: 'lens', title: 'لنز آزمایشی' }
});
ok('ساخت بخش تازه', created.s === 200 && !!created.d.section.id);
ok('کلید یکتا', /^lens:/.test(created.d.section.key), created.d.section.key);

const resetNew = await req(`/api/admin/guide/${created.d.section.id}/reset`, { method: 'POST', csrf });
ok('بخش دست‌ساز متن کارخانه ندارد', resetNew.s === 400);

ok('حذف بخش', (await req(`/api/admin/guide/${created.d.section.id}`, { method: 'DELETE', csrf })).s === 200);

console.log('\n── نمایش و پنهان‌سازی ──');
const exp = list.d.items.find(i => i.kind === 'experiment');
const before = (await req('/api/guide')).d.experiments.length;
await req(`/api/admin/guide/${exp.id}`, { method: 'PUT', csrf, body: { enabled: false } });
ok('بخش خاموش در API عمومی نیست',
   (await req('/api/guide')).d.experiments.length === before - 1);
await req(`/api/admin/guide/${exp.id}`, { method: 'PUT', csrf, body: { enabled: true } });
ok('روشن‌کردن دوباره', (await req('/api/guide')).d.experiments.length === before);

console.log('\n── دسترسی ──');
await req('/api/auth/logout', { method: 'POST', csrf });
ok('ناشناس به ویرایشگر دسترسی ندارد', (await req('/api/admin/guide')).s === 401);
const anon = await req('/api/guide');
ok('API عمومی برای همه باز است', anon.s === 200 && anon.d.lenses.length > 0);

console.log(`\n${'═'.repeat(46)}\n  موفق: ${pass}   ناموفق: ${fail}\n${'═'.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
