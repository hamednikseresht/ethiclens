/**
 * Test "update models" on a provider: catalogue, response time, and sync.
 *
 * Runs against a small OpenAI-compatible service started inside this script,
 * so no real key is needed and the models behave on cue — one fast, one slow,
 * one missing, one rate-limited, one that is not a chat model at all.
 *
 * Run:  node scripts/model-sync-flow.mjs   (with the server already running)
 */
// Loaded first: the session cookie must be signed with the server's secret.
import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import { db } from '../server/db.js';
import { getSetting, setSetting } from '../server/services/settings.js';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

/* ---------------- The stand-in provider ---------------- */

const KEY = `sync-key-${crypto.randomBytes(6).toString('hex')}`;
const LISTED = ['fast/model', 'slow/model', 'broken/model', 'busy/model', 'text-embedding-3-small'];

const upstream = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { message: 'bad key' } });

  if (req.method === 'GET' && req.url === '/v1/models') {
    return send(200, { data: LISTED.map(id => ({ id, object: 'model' })) });
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { model } = JSON.parse(raw);
    const reply = () => send(200, { choices: [{ message: { content: 'سالم' } }], usage: {} });

    if (model === 'fast/model') return reply();
    if (model === 'slow/model') return setTimeout(reply, 600);
    if (model === 'busy/model') return send(429, { error: { message: 'rate limited' } });
    return send(404, { error: { message: 'model not found' } });
  }
  send(404, {});
});
await new Promise(r => upstream.listen(0, '127.0.0.1', r));
const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/v1`;

/* ---------------- Signing in ---------------- */

function asUser(userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (sid,data,expires) VALUES (?,?,?)').run(
    sid,
    JSON.stringify({ cookie: { originalMaxAge: 3600000, httpOnly: true, path: '/' }, userId }),
    Date.now() + 3600_000
  );
  const secret = process.env.SESSION_SECRET || 'insecure-dev-secret-change-me';
  const sig = crypto.createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  const cookie = `ethiclens.sid=${encodeURIComponent('s:' + sid + '.' + sig)}`;

  let csrf = null;
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json', Cookie: cookie,
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch {}
    if (json?.csrf) csrf = json.csrf;
    return { status: res.status, json };
  };
  return { call, sid };
}

const stamp = Date.now();
const providerKey = `synctest${stamp}`;
const originalDefault = getSetting('default_model');
const created = { providerId: null, sids: [] };

// Cleans up however the script exits, so a failed assertion cannot leave a
// stand-in provider behind for the next test file to trip over.
function cleanup() {
  if (created.providerId) db.prepare('DELETE FROM providers WHERE id = ?').run(created.providerId);
  db.prepare('DELETE FROM audit_log WHERE detail LIKE ?').run(`%${providerKey}%`);
  if (getSetting('default_model') !== originalDefault) setSetting('default_model', originalDefault);
  for (const sid of created.sids) db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
}
process.on('exit', cleanup);
process.on('uncaughtException', e => { console.error('\n  ✗ خطای پیش‌بینی‌نشده:', e.message); process.exit(1); });
process.on('unhandledRejection', e => { console.error('\n  ✗ رد نشده:', e?.message || e); process.exit(1); });

console.log('══════════════════════════════════════════════');
console.log('  آزمون بروزرسانی مدل‌های ارائه‌دهنده');
console.log('══════════════════════════════════════════════');

const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
if (!admin) { console.error('  هیچ مدیری نیست'); process.exit(1); }

const A = asUser(admin.id);
created.sids.push(A.sid);
await A.call('/api/auth/me');

const mk = await A.call('/api/admin/providers', {
  method: 'POST', body: { key: providerKey, label: 'سرویس ساختگی', base_url: upstreamUrl, api_key: KEY }
});
created.providerId = mk.json?.id;
if (!created.providerId) { console.error('  ارائه‌دهنده ساخته نشد', mk.json); process.exit(1); }
const P = `/api/admin/providers/${created.providerId}`;

// Two models already stored: one the service still lists, one it has retired.
await A.call('/api/admin/models', {
  method: 'POST',
  body: { provider_id: created.providerId, models: [{ model_id: 'fast/model', label: 'برچسب دستی' }, { model_id: 'retired/model' }] }
});
db.prepare('UPDATE models SET enabled = 0 WHERE provider_id = ? AND model_id = ?').run(created.providerId, 'fast/model');

/* ================= Catalogue ================= */
section('فهرست مدل‌های سرویس');

const list = await A.call(`${P}/remote-models`);
check('فهرست دریافت شد', list.status === 200, `status ${list.status}`);
const byId = Object.fromEntries((list.json?.models || []).map(m => [m.id, m]));

check('همه مدل‌های سرویس آمدند', LISTED.every(id => byId[id]?.listed), Object.keys(byId).join(','));
check('مدل بازنشسته‌ای که ذخیره شده هم نشان داده می‌شود',
  byId['retired/model']?.added && byId['retired/model'].listed === false);
check('مدل ذخیره‌شده «فعلی» علامت خورده', byId['fast/model']?.added === true);
check('مدل تازه «فعلی» نیست', byId['slow/model']?.added === false);
check('مدل embedding گفتگو شمرده نشد', byId['text-embedding-3-small']?.chat === false);
check('مدل گفتگو گفتگو شمرده شد', byId['slow/model']?.chat === true);
check('هیچ مدلی پیش‌فرض نیست', !Object.values(byId).some(m => m.isDefault));

/* ================= Response time ================= */
section('زمان پاسخ');

const lat = (model) => A.call(`${P}/latency`, { method: 'POST', body: { model } });

const fast = await lat('fast/model');
check('مدل سریع سالم است', fast.status === 200 && fast.json?.ok === true, JSON.stringify(fast.json));
check('زمان پاسخ عدد است', typeof fast.json?.latencyMs === 'number');

const slow = await lat('slow/model');
check('مدل کند سالم است', slow.json?.ok === true, JSON.stringify(slow.json));
check('مدل کند کندتر گزارش شد', slow.json?.latencyMs > fast.json?.latencyMs,
  `${slow.json?.latencyMs} vs ${fast.json?.latencyMs}`);

const broken = await lat('broken/model');
check('مدل ناموجود ناموفق است ولی پاسخ ۲۰۰ است', broken.status === 200 && broken.json?.ok === false);
check('کد ۴۰۴ سرویس برگشت', broken.json?.status === 404, JSON.stringify(broken.json));
check('پیام خطا برای مدیر خواناست', /در دسترس نیست/.test(broken.json?.error || ''), broken.json?.error);

const busy = await lat('busy/model');
check('محدودیت نرخ با کد ۴۲۹ گزارش شد', busy.json?.ok === false && busy.json?.status === 429,
  JSON.stringify(busy.json));

const noModel = await A.call(`${P}/latency`, { method: 'POST', body: {} });
check('بدون شناسه مدل رد می‌شود', noModel.status === 400);

const noProv = await A.call('/api/admin/providers/99999999/latency', { method: 'POST', body: { model: 'x' } });
check('ارائه‌دهنده ناموجود ۴۰۴', noProv.status === 404);

/* ================= Sync ================= */
section('اعمال انتخاب');

const stored = () => db.prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY sort_order')
  .all(created.providerId);

const bad = await A.call(`${P}/models`, { method: 'PUT', body: { models: 'fast/model' } });
check('بدنه غیرآرایه رد می‌شود', bad.status === 400);

const sync = await A.call(`${P}/models`, { method: 'PUT', body: { models: ['fast/model', 'slow/model'] } });
check('اعمال موفق', sync.status === 200, JSON.stringify(sync.json));
check('یکی افزوده و یکی حذف شد', sync.json?.added === 1 && sync.json?.removed === 1, JSON.stringify(sync.json));

let rows = stored();
check('فقط مدل‌های تیک‌خورده ماندند',
  rows.map(r => r.model_id).join(',') === 'fast/model,slow/model', rows.map(r => r.model_id).join(','));
const fastRow = rows.find(r => r.model_id === 'fast/model');
check('برچسب مدل موجود دست نخورد', fastRow?.label === 'برچسب دستی', fastRow?.label);
check('خاموش بودن مدل موجود حفظ شد', fastRow?.enabled === 0);
check('مدل تازه روشن اضافه شد', rows.find(r => r.model_id === 'slow/model')?.enabled === 1);

const reorder = await A.call(`${P}/models`, { method: 'PUT', body: { models: ['slow/model', 'fast/model'] } });
rows = stored();
check('ترتیب فهرست ترتیب مدل‌ها شد',
  reorder.json?.added === 0 && reorder.json?.removed === 0 && rows[0]?.model_id === 'slow/model',
  rows.map(r => r.model_id).join(','));

/* ================= The default model ================= */
section('مدل پیش‌فرض');

setSetting('default_model', `${providerKey}:fast/model`);
const again = await A.call(`${P}/remote-models`);
check('مدل پیش‌فرض علامت خورده',
  (again.json?.models || []).find(m => m.id === 'fast/model')?.isDefault === true);

const guard = await A.call(`${P}/models`, { method: 'PUT', body: { models: ['slow/model'] } });
check('حذف مدل پیش‌فرض رد می‌شود', guard.status === 400, `status ${guard.status}`);
check('پس از رد، چیزی حذف نشد', stored().length === 2);
setSetting('default_model', originalDefault);

/* ================= Audit ================= */
section('گزارش رویداد');

const logged = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'models_sync' AND detail LIKE ?")
  .get(`%${providerKey}%`).c;
check('بروزرسانی در گزارش رویدادها ثبت شد', logged >= 2, `${logged}`);

upstream.close();

console.log('\n══════════════════════════════════════════════');
console.log(`  موفق: ${pass}   ناموفق: ${fail}`);
console.log('══════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
