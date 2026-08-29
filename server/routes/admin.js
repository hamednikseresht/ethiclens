import express from 'express';
import bcrypt from 'bcryptjs';
import { db, audit } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, setSetting, getSetting } from '../services/settings.js';
import { listRemoteModels, streamChat } from '../services/nvidia.js';
import { DEFAULT_PROMPT } from '../services/default-prompt.js';

export const router = express.Router();
router.use(requireAdmin);

const MASK = '••••••••••••';

/* ---------------- داشبورد ---------------- */
router.get('/overview', (req, res) => {
  const users = db.prepare(`SELECT COUNT(*) total,
      SUM(role = 'admin') admins,
      SUM(status = 'suspended') suspended,
      SUM(created_at >= datetime('now','-7 days')) newWeek FROM users`).get();

  const analyses = db.prepare(`SELECT COUNT(*) total,
      SUM(status = 'done') done,
      SUM(status = 'error') failed,
      SUM(date(created_at) = date('now')) today,
      COALESCE(SUM(tokens_in), 0) tokensIn,
      COALESCE(SUM(tokens_out), 0) tokensOut,
      COALESCE(AVG(NULLIF(duration_ms, 0)), 0) avgMs FROM analyses`).get();

  const daily = db.prepare(`SELECT date(created_at) d, COUNT(*) c FROM analyses
      WHERE created_at >= datetime('now','-29 days') GROUP BY d ORDER BY d`).all();

  const byModel = db.prepare(`SELECT model, COUNT(*) c, COALESCE(AVG(NULLIF(duration_ms,0)),0) avgMs
      FROM analyses GROUP BY model ORDER BY c DESC`).all();

  const topUsers = db.prepare(`SELECT u.id, u.name, u.email, COUNT(a.id) c
      FROM users u LEFT JOIN analyses a ON a.user_id = u.id
      GROUP BY u.id ORDER BY c DESC LIMIT 8`).all();

  res.json({ users, analyses, daily, byModel, topUsers, apiKeySet: !!getSetting('nvidia_api_key') });
});

/* ---------------- تنظیمات ---------------- */
router.get('/settings', (req, res) => {
  const s = getSettings();
  res.json({ ...s, nvidia_api_key: s.nvidia_api_key ? MASK : '' });
});

const ALLOWED_SETTINGS = new Set([
  'site_title', 'site_tagline', 'nvidia_api_key', 'nvidia_base_url', 'default_model',
  'temperature', 'top_p', 'max_tokens', 'active_prompt_key',
  'allow_registration', 'default_daily_quota', 'guest_preview'
]);

router.post('/settings', (req, res) => {
  const patch = req.body || {};
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_SETTINGS.has(k)) continue;
    if (k === 'nvidia_api_key' && (v === MASK || v === '')) continue;
    setSetting(k, v);
    changed.push(k);
  }
  audit(req.user.id, 'settings_update', { changed }, req.ip);
  res.json({ ok: true, changed });
});

router.post('/test-key', async (req, res) => {
  try {
    const model = String(req.body?.model || getSetting('default_model'));
    const started = Date.now();
    const { text } = await streamChat({
      model,
      messages: [{ role: 'user', content: 'فقط و فقط بنویس: سالم' }],
      overrides: { max_tokens: 16, temperature: 0 }
    });
    res.json({ ok: true, model, reply: text.trim().slice(0, 120), latencyMs: Date.now() - started });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, detail: e.detail });
  }
});

/* ---------------- مدل‌ها ---------------- */
router.get('/models', (req, res) => {
  res.json(db.prepare('SELECT * FROM models ORDER BY sort_order, id').all());
});

router.get('/models/remote', async (req, res) => {
  try { res.json({ models: await listRemoteModels() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/models', (req, res) => {
  const model_id = String(req.body?.model_id || '').trim();
  const label = String(req.body?.label || '').trim() || model_id;
  if (!model_id) return res.status(400).json({ error: 'شناسه مدل لازم است.' });
  try {
    db.prepare('INSERT INTO models (model_id, label, note, enabled, sort_order) VALUES (?,?,?,?,?)')
      .run(model_id, label, String(req.body?.note || ''), req.body?.enabled === false ? 0 : 1,
           Number(req.body?.sort_order) || 100);
    audit(req.user.id, 'model_add', { model_id }, req.ip);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'این مدل قبلاً ثبت شده است.' });
  }
});

router.put('/models/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'مدل یافت نشد.' });
  db.prepare('UPDATE models SET label = ?, note = ?, enabled = ?, sort_order = ? WHERE id = ?')
    .run(req.body?.label ?? m.label, req.body?.note ?? m.note,
         req.body?.enabled === undefined ? m.enabled : (req.body.enabled ? 1 : 0),
         Number(req.body?.sort_order ?? m.sort_order), m.id);
  res.json({ ok: true });
});

router.delete('/models/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'مدل یافت نشد.' });
  if (m.model_id === getSetting('default_model')) {
    return res.status(400).json({ error: 'مدل پیش‌فرض را نمی‌توان حذف کرد. ابتدا پیش‌فرض را عوض کنید.' });
  }
  db.prepare('DELETE FROM models WHERE id = ?').run(m.id);
  audit(req.user.id, 'model_delete', { model_id: m.model_id }, req.ip);
  res.json({ ok: true });
});

/* ---------------- دستورهای مدل ---------------- */
router.get('/prompts', (req, res) => {
  res.json({
    items: db.prepare('SELECT * FROM prompts ORDER BY id').all(),
    activeKey: getSetting('active_prompt_key'),
    factoryDefault: DEFAULT_PROMPT
  });
});

router.post('/prompts', (req, res) => {
  const key = String(req.body?.key || '').trim().replace(/\s+/g, '-');
  const label = String(req.body?.label || '').trim() || key;
  const content = String(req.body?.content || '').trim();
  if (!key || !content) return res.status(400).json({ error: 'کلید و متن دستور لازم است.' });
  try {
    db.prepare('INSERT INTO prompts (key, label, content) VALUES (?,?,?)').run(key, label, content);
    audit(req.user.id, 'prompt_create', { key }, req.ip);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'این کلید قبلاً استفاده شده است.' });
  }
});

router.put('/prompts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'دستور یافت نشد.' });
  db.prepare(`UPDATE prompts SET label = ?, content = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(req.body?.label ?? p.label, String(req.body?.content ?? p.content), p.id);
  audit(req.user.id, 'prompt_update', { key: p.key }, req.ip);
  res.json({ ok: true });
});

router.post('/prompts/:id/activate', (req, res) => {
  const p = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'دستور یافت نشد.' });
  db.prepare('UPDATE prompts SET is_active = 0').run();
  db.prepare('UPDATE prompts SET is_active = 1 WHERE id = ?').run(p.id);
  setSetting('active_prompt_key', p.key);
  audit(req.user.id, 'prompt_activate', { key: p.key }, req.ip);
  res.json({ ok: true, activeKey: p.key });
});

router.delete('/prompts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'دستور یافت نشد.' });
  if (p.key === getSetting('active_prompt_key')) {
    return res.status(400).json({ error: 'دستور فعال را نمی‌توان حذف کرد.' });
  }
  db.prepare('DELETE FROM prompts WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

/* ---------------- کاربران ---------------- */
router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = 20;
  const where = q ? 'WHERE u.email LIKE ? OR u.name LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`] : [];

  const total = db.prepare(`SELECT COUNT(*) c FROM users u ${where}`).get(...params).c;
  const items = db.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.daily_quota, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM analyses a WHERE a.user_id = u.id) analyses
     FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, perPage, (page - 1) * perPage);

  res.json({ items, total, page, pages: Math.ceil(total / perPage) || 1 });
});

router.put('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد.' });

  const role = req.body?.role === 'admin' ? 'admin' : (req.body?.role === 'user' ? 'user' : u.role);
  const status = ['active', 'suspended'].includes(req.body?.status) ? req.body.status : u.status;

  if (u.id === req.user.id && (role !== 'admin' || status !== 'active')) {
    return res.status(400).json({ error: 'نمی‌توانید دسترسی حساب خودتان را سلب کنید.' });
  }
  if (u.role === 'admin' && role === 'user') {
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND status = 'active'").get().c;
    if (admins <= 1) return res.status(400).json({ error: 'حداقل یک مدیر فعال باید باقی بماند.' });
  }

  db.prepare('UPDATE users SET role = ?, status = ?, daily_quota = ?, name = ? WHERE id = ?')
    .run(role, status, Number(req.body?.daily_quota ?? u.daily_quota), String(req.body?.name ?? u.name), u.id);
  audit(req.user.id, 'user_update', { targetId: u.id, role, status }, req.ip);
  res.json({ ok: true });
});

router.post('/users/:id/reset-password', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد.' });
  const next = String(req.body?.password || '');
  if (next.length < 8) return res.status(400).json({ error: 'رمز باید حداقل ۸ نویسه باشد.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), u.id);
  audit(req.user.id, 'user_reset_password', { targetId: u.id }, req.ip);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد.' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'حساب خودتان را نمی‌توانید حذف کنید.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  audit(req.user.id, 'user_delete', { targetId: u.id, email: u.email }, req.ip);
  res.json({ ok: true });
});

/* ---------------- تحلیل‌ها و گزارش ---------------- */
router.get('/analyses', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = 20;
  const total = db.prepare('SELECT COUNT(*) c FROM analyses').get().c;
  const items = db.prepare(
    `SELECT a.id, a.title, a.model, a.status, a.duration_ms, a.created_at, u.email, u.name
     FROM analyses a JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(perPage, (page - 1) * perPage);
  res.json({ items, total, page, pages: Math.ceil(total / perPage) || 1 });
});

router.get('/audit', (req, res) => {
  const items = db.prepare(
    `SELECT l.*, u.email FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
     ORDER BY l.created_at DESC LIMIT 200`).all();
  res.json({ items });
});
