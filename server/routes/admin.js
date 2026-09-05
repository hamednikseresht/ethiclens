import express from 'express';
import bcrypt from 'bcryptjs';
import { db, audit } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, setSetting, getSetting } from '../services/settings.js';
import { listRemoteModels, pingModel } from '../services/llm.js';
import { PRESETS, listProviders, getProvider, enabledModels, resolveModel, modelRef } from '../services/providers.js';
import { listTiers, TIER_ORDER, usageByUser, limitsFor, usageFor } from '../services/tiers.js';
import { mailConfigured, sendMail, mailProvider, MAIL_PROVIDERS } from '../services/mail.js';
import { checkAndStore } from '../services/email-check.js';
import {
  listSections, getSection as getGuideSection, updateSection as updateGuideSection,
  createSection as createGuideSection, deleteSection as deleteGuideSection,
  resetSection as resetGuideSection, isModified
} from '../services/guide.js';
import { DEFAULT_PROMPT } from '../services/default-prompt.js';
import {
  listCategories, getCategory, createCategory, updateCategory, deleteCategory,
  countInCategory
} from '../services/categories.js';

export const router = express.Router();
router.use(requireAdmin);

const MASK = '••••••••••••';

/**
 * What is waiting for an admin's decision.
 *
 * Separate from /overview, which runs seven aggregate queries and is fetched
 * only when the panel is opened. This one is polled from the app shell on
 * every screen, so it stays a single count — the point is that a membership
 * request should not sit unseen because nobody happened to open the panel.
 */
router.get('/notifications', (req, res) => {
  const pendingUsers = db.prepare(
    "SELECT COUNT(*) c FROM users WHERE status = 'pending'").get().c;

  res.set('Cache-Control', 'no-store');
  res.json({ pendingUsers });
});

/* ---------------- Dashboard ---------------- */
router.get('/overview', (req, res) => {
  const users = db.prepare(`SELECT COUNT(*) total,
      SUM(role = 'admin') admins,
      SUM(status = 'suspended') suspended,
      SUM(created_at >= datetime('now','-7 days')) newWeek,
      SUM(status = 'pending') pending,
      SUM(status = 'rejected') rejected,
      SUM(email_valid = 0) suspectEmail FROM users`).get();

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

  const providers = listProviders().map(p => ({
    key: p.key, label: p.label, enabled: !!p.enabled, hasKey: !!p.api_key,
    models: db.prepare('SELECT COUNT(*) c FROM models WHERE provider_id = ? AND enabled = 1').get(p.id).c
  }));

  const activeModels = enabledModels().length;
  const defaultOk = !!resolveModel(getSetting('default_model'));

  res.json({ users, analyses, daily, byModel, topUsers, providers, activeModels, defaultOk,
             mailConfigured: mailConfigured() });
});

/* ---------------- Providers ---------------- */
router.get('/providers', (req, res) => {
  res.json({
    presets: PRESETS,
    items: listProviders().map(p => ({
      ...p, api_key: p.api_key ? MASK : '',
      models: db.prepare('SELECT COUNT(*) c FROM models WHERE provider_id = ?').get(p.id).c,
      modelsEnabled: db.prepare('SELECT COUNT(*) c FROM models WHERE provider_id = ? AND enabled = 1').get(p.id).c
    }))
  });
});

router.post('/providers', (req, res) => {
  const key = String(req.body?.key || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const label = String(req.body?.label || '').trim() || key;
  const base_url = String(req.body?.base_url || '').trim();

  if (!key) return res.status(400).json({ error: 'شناسه ارائه‌دهنده لازم است.' });
  if (!/^https?:\/\//i.test(base_url)) return res.status(400).json({ error: 'آدرس پایه باید با http:// یا https:// شروع شود.' });

  try {
    const info = db.prepare(
      `INSERT INTO providers (key, label, base_url, api_key, enabled, sort_order)
       VALUES (?,?,?,?,?,?)`
    ).run(key, label, base_url.replace(/\/+$/, ''), String(req.body?.api_key || ''),
          req.body?.enabled === false ? 0 : 1, Number(req.body?.sort_order) || 100);
    audit(req.user.id, 'provider_add', { key, base_url }, req.ip);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'ارائه‌دهنده‌ای با این شناسه از قبل وجود دارد.' });
  }
});

router.put('/providers/:id', (req, res) => {
  const p = getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: 'ارائه‌دهنده یافت نشد.' });

  const base_url = req.body?.base_url !== undefined
    ? String(req.body.base_url).trim().replace(/\/+$/, '') : p.base_url;
  if (base_url && !/^https?:\/\//i.test(base_url)) {
    return res.status(400).json({ error: 'آدرس پایه باید با http:// یا https:// شروع شود.' });
  }

  // A masked key means "leave it alone"
  const rawKey = req.body?.api_key;
  const api_key = (rawKey === undefined || rawKey === MASK || rawKey === '') ? p.api_key : String(rawKey).trim();

  db.prepare(`UPDATE providers SET label = ?, base_url = ?, api_key = ?, enabled = ?, sort_order = ?
              WHERE id = ?`)
    .run(String(req.body?.label ?? p.label), base_url, api_key,
         req.body?.enabled === undefined ? p.enabled : (req.body.enabled ? 1 : 0),
         Number(req.body?.sort_order ?? p.sort_order), p.id);

  audit(req.user.id, 'provider_update', { key: p.key }, req.ip);
  res.json({ ok: true });
});

router.delete('/providers/:id', (req, res) => {
  const p = getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: 'ارائه‌دهنده یافت نشد.' });

  const count = db.prepare('SELECT COUNT(*) c FROM models WHERE provider_id = ?').get(p.id).c;
  if (count && !req.query.force) {
    return res.status(400).json({
      error: `این ارائه‌دهنده ${count} مدل ثبت‌شده دارد. با حذف آن، همه این مدل‌ها هم حذف می‌شوند.`,
      needsForce: true, models: count
    });
  }

  db.prepare('DELETE FROM providers WHERE id = ?').run(p.id);   // models follow via CASCADE
  audit(req.user.id, 'provider_delete', { key: p.key, models: count }, req.ip);
  res.json({ ok: true });
});

/** Connection test — with a given model, or the provider's first enabled one */
router.post('/providers/:id/test', async (req, res) => {
  const p = getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: 'ارائه‌دهنده یافت نشد.' });

  const model = String(req.body?.model || '').trim()
    || db.prepare('SELECT model_id FROM models WHERE provider_id = ? AND enabled = 1 ORDER BY sort_order LIMIT 1')
         .get(p.id)?.model_id;
  if (!model) return res.status(400).json({ error: 'مدلی برای آزمایش مشخص نشده و این ارائه‌دهنده مدل فعالی ندارد.' });

  try {
    const r = await pingModel(p, model);
    res.json({ ok: true, provider: p.label, model, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, detail: e.detail });
  }
});

/** Models available on a provider account */
router.get('/providers/:id/remote-models', async (req, res) => {
  const p = getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: 'ارائه‌دهنده یافت نشد.' });
  try {
    const remote = await listRemoteModels(p);
    const known = new Set(db.prepare('SELECT model_id FROM models WHERE provider_id = ?').all(p.id).map(r => r.model_id));
    res.json({ provider: p.label, models: remote.map(id => ({ id, added: known.has(id) })) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------------- User tiers ---------------- */
router.get('/tiers', (req, res) => {
  const counts = Object.fromEntries(
    db.prepare('SELECT tier, COUNT(*) c FROM users GROUP BY tier').all().map(r => [r.tier, r.c]));
  const models = Object.fromEntries(
    db.prepare('SELECT min_tier, COUNT(*) c FROM models WHERE enabled = 1 GROUP BY min_tier').all()
      .map(r => [r.min_tier, r.c]));

  res.json({
    order: TIER_ORDER,
    items: listTiers().map(t => ({
      ...t,
      users: counts[t.key] || 0,
      exclusiveModels: models[t.key] || 0
    }))
  });
});

router.put('/tiers/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tiers WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'گروه یافت نشد.' });

  const daily = req.body?.daily_quota === undefined
    ? t.daily_quota : Math.max(0, Math.min(10000, Number(req.body.daily_quota) || 0));
  const tokens = req.body?.monthly_tokens === undefined
    ? t.monthly_tokens : Math.max(0, Number(req.body.monthly_tokens) || 0);
  const label = String(req.body?.label ?? t.label).trim() || t.label;

  db.prepare('UPDATE tiers SET label = ?, daily_quota = ?, monthly_tokens = ? WHERE id = ?')
    .run(label, daily, tokens, t.id);

  audit(req.user.id, 'tier_update', { key: t.key, daily, tokens }, req.ip);
  res.json({ ok: true });
});

/* ---------------- Settings ---------------- */

/**
 * Only these keys reach the client. The list is an allowlist so that a
 * sensitive leftover row (an old-version API key, say) cannot leak.
 */
const PUBLIC_SETTINGS = [
  'site_title', 'site_tagline', 'site_url', 'og_image', 'default_model',
  'temperature', 'top_p', 'max_tokens', 'reasoning_headroom', 'active_prompt_key',
  'allow_registration', 'default_daily_quota',
  'signup_code',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_secure',
  'mail_provider', 'mailgun_domain', 'mailgun_base_url', 'mail_from_name', 'mail_from_email'
];

router.get('/settings', (req, res) => {
  const s = getSettings();
  const out = {};
  for (const k of PUBLIC_SETTINGS) out[k] = s[k];

  const models = enabledModels();
  res.json({
    ...out,
    modelOptions: models.map(m => ({ ref: modelRef(m), label: `${m.provider_label} — ${m.label}` })),
    defaultModelValid: !!resolveModel(s.default_model),
    mailConfigured: mailConfigured(),
    mailProviders: MAIL_PROVIDERS,
    mailProvider: mailProvider(),
    mailKeySet: mailProvider() === 'brevo'
      ? !!getSetting('brevo_api_key') : !!getSetting('mailgun_api_key'),
    // Never send the secrets themselves — only whether each one is present,
    // so the form can say "leave blank to keep" instead of showing a value.
    brevoKeySet: !!getSetting('brevo_api_key'),
    smtpPassSet: !!getSetting('smtp_pass')
  });
});

const ALLOWED_SETTINGS = new Set([
  'site_title', 'site_tagline', 'site_url', 'og_image', 'default_model',
  'temperature', 'top_p', 'max_tokens', 'reasoning_headroom', 'active_prompt_key',
  'allow_registration', 'default_daily_quota',
  'signup_code',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_secure',
  'mail_provider', 'brevo_api_key', 'smtp_pass',
  'mailgun_api_key', 'mailgun_domain', 'mailgun_base_url', 'mail_from_name', 'mail_from_email'
]);

router.post('/settings', (req, res) => {
  const patch = req.body || {};
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_SETTINGS.has(k)) continue;
    setSetting(k, v);
    changed.push(k);
  }
  audit(req.user.id, 'settings_update', { changed }, req.ip);
  res.json({ ok: true, changed });
});

/** Send a test email to the admin themselves */
router.post('/test-mail', async (req, res) => {
  const to = String(req.body?.to || req.user.email).trim();
  try {
    const r = await sendMail({
      to,
      subject: 'Ethic Lens — ایمیل آزمایشی',
      html: `<div style="font-family:Tahoma,sans-serif;direction:rtl;padding:20px">
               <h2 style="color:#2563eb">اتصال ایمیل سالم است ✅</h2>
               <p>این پیام آزمایشی از پنل مدیریت Ethic Lens فرستاده شده است.
                  اگر آن را می‌بینید، تنظیمات میل‌گان درست است و ایمیل‌های تأیید حساب ارسال می‌شوند.</p>
             </div>`,
      tag: 'test'
    });
    audit(req.user.id, 'mail_test', { to, id: r.id }, req.ip);
    res.json({ ok: true, to, id: r.id });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, detail: e.detail });
  }
});

/** Manually mark a user's email as verified */
router.post('/users/:id/verify-email', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد.' });

  const verify = req.body?.verified !== false;
  db.prepare(`UPDATE users SET email_verified = ?, verified_at = ? WHERE id = ?`)
    .run(verify ? 1 : 0, verify ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, u.id);

  audit(req.user.id, 'user_verify_email', { targetId: u.id, verified: verify }, req.ip);
  res.json({ ok: true, verified: verify });
});

/* ---------------- Models ---------------- */
router.get('/models', (req, res) => {
  res.json(db.prepare(`
    SELECT m.*, p.key AS provider_key, p.label AS provider_label, p.enabled AS provider_enabled
    FROM models m JOIN providers p ON p.id = m.provider_id
    ORDER BY p.sort_order, m.sort_order, m.id`).all());
});

router.post('/models', (req, res) => {
  const provider_id = Number(req.body?.provider_id);
  const p = getProvider(provider_id);
  if (!p) return res.status(400).json({ error: 'ارائه‌دهنده معتبر انتخاب نشده است.' });

  // Accepts either one model or a list of them
  const items = Array.isArray(req.body?.models) ? req.body.models
    : [{ model_id: req.body?.model_id, label: req.body?.label, note: req.body?.note }];

  const minTier = TIER_ORDER.includes(req.body?.min_tier) ? req.body.min_tier : 'basic';
  const ins = db.prepare(`INSERT INTO models (provider_id, model_id, label, note, enabled, min_tier, sort_order)
                          VALUES (?,?,?,?,?,?,?) ON CONFLICT(provider_id, model_id) DO NOTHING`);
  let added = 0, skipped = 0;
  const baseSort = Number(req.body?.sort_order) || 100;

  db.transaction(() => {
    items.forEach((it, i) => {
      const mid = String(it?.model_id || '').trim();
      if (!mid) { skipped++; return; }
      const r = ins.run(p.id, mid, String(it?.label || '').trim() || mid.split('/').pop(),
                        String(it?.note || ''), req.body?.enabled === false ? 0 : 1,
                        minTier, baseSort + i);
      if (r.changes) added++; else skipped++;
    });
  })();

  if (!added && !skipped) return res.status(400).json({ error: 'شناسه مدل لازم است.' });
  audit(req.user.id, 'model_add', { provider: p.key, added, skipped }, req.ip);
  res.json({ ok: true, added, skipped });
});

router.put('/models/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'مدل یافت نشد.' });
  const minTier = TIER_ORDER.includes(req.body?.min_tier) ? req.body.min_tier : m.min_tier;
  db.prepare('UPDATE models SET label = ?, note = ?, enabled = ?, min_tier = ?, sort_order = ? WHERE id = ?')
    .run(req.body?.label ?? m.label, req.body?.note ?? m.note,
         req.body?.enabled === undefined ? m.enabled : (req.body.enabled ? 1 : 0),
         minTier, Number(req.body?.sort_order ?? m.sort_order), m.id);
  res.json({ ok: true });
});

router.delete('/models/:id', (req, res) => {
  const m = db.prepare(`SELECT m.*, p.key AS provider_key FROM models m
                        JOIN providers p ON p.id = m.provider_id WHERE m.id = ?`).get(req.params.id);
  if (!m) return res.status(404).json({ error: 'مدل یافت نشد.' });
  if (`${m.provider_key}:${m.model_id}` === getSetting('default_model')) {
    return res.status(400).json({ error: 'مدل پیش‌فرض را نمی‌توان حذف کرد. ابتدا پیش‌فرض را عوض کنید.' });
  }
  db.prepare('DELETE FROM models WHERE id = ?').run(m.id);
  audit(req.user.id, 'model_delete', { model_id: m.model_id, provider: m.provider_key }, req.ip);
  res.json({ ok: true });
});

/** Bulk-test every model — surfaces the broken ones */
router.post('/models/probe', async (req, res) => {
  const rows = db.prepare(`
    SELECT m.id, m.model_id, m.label, m.enabled,
           p.id AS pid, p.label AS provider_label, p.base_url, p.api_key, p.key AS provider_key
    FROM models m JOIN providers p ON p.id = m.provider_id
    WHERE p.enabled = 1 ${req.body?.onlyEnabled === false ? '' : 'AND m.enabled = 1'}
    ORDER BY p.sort_order, m.sort_order`).all();

  const disableBroken = req.body?.disableBroken === true;
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const r = rows[cursor++];
      const provider = { label: r.provider_label, base_url: r.base_url, api_key: r.api_key };
      try {
        const ping = await pingModel(provider, r.model_id, 45000);
        results.push({ id: r.id, model: r.model_id, label: r.label, provider: r.provider_label, ok: true, ...ping });
      } catch (e) {
        results.push({ id: r.id, model: r.model_id, label: r.label, provider: r.provider_label,
                       ok: false, error: e.message });
        if (disableBroken) db.prepare('UPDATE models SET enabled = 0 WHERE id = ?').run(r.id);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, rows.length || 1) }, worker));

  results.sort((a, b) => (b.ok - a.ok) || ((a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9)));
  const broken = results.filter(r => !r.ok).length;
  audit(req.user.id, 'models_probe', { total: results.length, broken, disableBroken }, req.ip);
  res.json({ results, total: results.length, ok: results.length - broken, broken });
});

/* ---------------- Model prompts ---------------- */
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

/* ---------------- Users ---------------- */
router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = 20;
  const clauses = [];
  const params = [];
  if (q) { clauses.push('(u.email LIKE ? OR u.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const st = String(req.query.status || '').trim();
  if (['pending', 'active', 'rejected', 'suspended'].includes(st)) {
    clauses.push('u.status = ?'); params.push(st);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM users u ${where}`).get(...params).c;
  const rows = db.prepare(
    `SELECT u.id, u.email, u.name, u.first_name, u.last_name, u.role, u.tier, u.status,
            u.email_valid, u.email_checked_at, u.email_check_note,
            u.approved_at, u.review_note,
            u.quota_override, u.token_override, u.created_at, u.last_login_at
     FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, perPage, (page - 1) * perPage);

  const usage = Object.fromEntries(usageByUser().map(u => [u.id, u]));
  const tiers = Object.fromEntries(listTiers().map(t => [t.key, t]));

  const items = rows.map(u => {
    const lim = limitsFor(u);
    const use = usage[u.id] || { analyses: 0, totalTokens: 0, monthTokens: 0, todayAnalyses: 0 };
    return {
      ...u,
      tierLabel: tiers[u.tier]?.label || u.tier,
      analyses: use.analyses,
      todayAnalyses: use.todayAnalyses,
      totalTokens: use.totalTokens,
      monthTokens: use.monthTokens,
      effectiveQuota: lim.dailyQuota,
      effectiveTokens: lim.monthlyTokens,
      tokenPercent: lim.monthlyTokens > 0
        ? Math.min(100, Math.round((use.monthTokens / lim.monthlyTokens) * 100)) : null
    };
  });

  const counts = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) c FROM users GROUP BY status').all().map(r => [r.status, r.c]));

  res.json({ items, total, page, pages: Math.ceil(total / perPage) || 1,
             tiers: listTiers(), counts });
});

router.put('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد.' });

  const role = req.body?.role === 'admin' ? 'admin' : (req.body?.role === 'user' ? 'user' : u.role);
  const status = ['active', 'suspended', 'pending', 'rejected'].includes(req.body?.status)
    ? req.body.status : u.status;

  if (u.id === req.user.id && (role !== 'admin' || status !== 'active')) {
    return res.status(400).json({ error: 'نمی‌توانید دسترسی حساب خودتان را سلب کنید.' });
  }
  if (u.role === 'admin' && role === 'user') {
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND status = 'active'").get().c;
    if (admins <= 1) return res.status(400).json({ error: 'حداقل یک مدیر فعال باید باقی بماند.' });
  }

  const tier = TIER_ORDER.includes(req.body?.tier) ? req.body.tier : u.tier;

    // An empty string means "drop the exception and inherit from the tier"
  const asOverride = v => {
    if (v === undefined) return undefined;
    if (v === null || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 100000000) : null;
  };

  const quota = asOverride(req.body?.quota_override);
  const tokens = asOverride(req.body?.token_override);

  db.prepare(`UPDATE users SET role = ?, status = ?, tier = ?, name = ?,
              quota_override = ?, token_override = ? WHERE id = ?`)
    .run(role, status, tier, String(req.body?.name ?? u.name),
         quota === undefined ? u.quota_override : quota,
         tokens === undefined ? u.token_override : tokens,
         u.id);

  audit(req.user.id, 'user_update',
        { targetId: u.id, role, status, tier, quota, tokens }, req.ip);
  res.json({ ok: true });
});

/**
 * Approve or reject a membership request.
 *
 * Approve: status becomes active and, when mail is configured, the user is
 * notified. Reject: status becomes rejected with an optional admin note,
 * which is shown to them if they try to sign in.
 */
router.post('/users/:id/review', async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد.' });

  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'تصمیم باید approve یا reject باشد.' });
  }
  if (u.id === req.user.id) {
    return res.status(400).json({ error: 'حساب خودتان را نمی‌توانید بررسی کنید.' });
  }

  const note = String(req.body?.note || '').trim().slice(0, 400) || null;
  const status = decision === 'approve' ? 'active' : 'rejected';

  db.prepare(`UPDATE users SET status = ?, review_note = ?,
              approved_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE NULL END,
              approved_by = ? WHERE id = ?`)
    .run(status, note, status, req.user.id, u.id);

  audit(req.user.id, decision === 'approve' ? 'user_approve' : 'user_reject',
        { targetId: u.id, email: u.email, note }, req.ip);

  // Notifying the user is optional and must not hold up the admin's decision
  let notified = false;
  if (mailConfigured()) {
    try {
      await sendMail({
        to: u.email,
        subject: decision === 'approve'
          ? `${getSetting('site_title') || 'Ethic Lens'} — حساب شما تأیید شد`
          : `${getSetting('site_title') || 'Ethic Lens'} — نتیجه بررسی درخواست عضویت`,
        html: decision === 'approve'
          ? `<div style="font-family:Tahoma,sans-serif;direction:rtl;padding:20px;line-height:2">
               <h2 style="color:#16a34a">حساب شما تأیید شد ✅</h2>
               <p>${u.name} عزیز، حساب شما فعال شد و می‌توانید وارد شوید و اولین دوراهی‌تان را تحلیل کنید.</p>
             </div>`
          : `<div style="font-family:Tahoma,sans-serif;direction:rtl;padding:20px;line-height:2">
               <h2>نتیجه بررسی درخواست عضویت</h2>
               <p>${u.name} عزیز، درخواست عضویت شما در این مرحله پذیرفته نشد.</p>
               ${note ? `<p><strong>توضیح:</strong> ${note}</p>` : ''}
             </div>`,
        tag: decision
      });
      notified = true;
    } catch (e) {
      console.error('[review] notification failed:', e.message);
    }
  }

  res.json({ ok: true, status, notified });
});

/** Re-run the email plausibility check for a user */
router.post('/users/:id/check-email', async (req, res) => {
  const u = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد.' });
  const r = await checkAndStore(u.id, u.email);
  audit(req.user.id, 'email_check', { targetId: u.id, valid: r.valid }, req.ip);
  res.json({ ok: true, ...r });
});

/** Activity report for one user — to inform the approval decision */
router.get('/users/:id/activity', (req, res) => {
  const u = db.prepare(`SELECT id, email, name, first_name, last_name, status, tier, role,
                               email_valid, email_check_note, email_checked_at,
                               review_note, approved_at, created_at, last_login_at
                        FROM users WHERE id = ?`).get(req.params.id);
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد.' });

  const stats = db.prepare(`
    SELECT COUNT(*) analyses,
           SUM(status = 'done') completed,
           SUM(status = 'error') failed,
           COALESCE(SUM(tokens_in + tokens_out), 0) tokens,
           MIN(created_at) firstAt, MAX(created_at) lastAt
    FROM analyses WHERE user_id = ?`).get(u.id);

  const recent = db.prepare(`
    SELECT id, title, status, created_at, duration_ms FROM analyses
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`).all(u.id);

  const events = db.prepare(`
    SELECT action, detail, ip, created_at FROM audit_log
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`).all(u.id);

  res.json({ user: u, stats, recent, events });
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

/* ---------------- Analyses and reporting ---------------- */
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

/* ==========================================================================
   Encyclopedia content
   ========================================================================== */
router.get('/guide', (req, res) => {
  const items = listSections().map(s => ({ ...s, modified: isModified(s) }));
  const byKind = {};
  for (const s of items) (byKind[s.kind] ||= []).push(s);

  res.json({
    items, byKind,
    counts: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])),
    kinds: [
      { key: 'prose',      label: 'متن آزاد' },
      { key: 'phase',      label: 'فاز فرایند' },
      { key: 'lens',       label: 'لنز اخلاقی' },
      { key: 'gate',       label: 'دروازه پالایش' },
      { key: 'experiment', label: 'آزمایش فکری' }
    ]
  });
});

router.get('/guide/:id', (req, res) => {
  const s = getGuideSection(req.params.id);
  if (!s) return res.status(404).json({ error: 'بخش یافت نشد.' });
  res.json({ ...s, modified: isModified(s) });
});

router.put('/guide/:id', (req, res) => {
  const s = updateGuideSection(req.params.id, req.body || {}, req.user.id);
  if (!s) return res.status(404).json({ error: 'بخش یافت نشد.' });
  audit(req.user.id, 'guide_update', { key: s.key }, req.ip);
  res.json({ ok: true, section: { ...s, modified: isModified(s) } });
});

router.post('/guide', (req, res) => {
  const s = createGuideSection(req.body || {}, req.user.id);
  audit(req.user.id, 'guide_create', { key: s.key, kind: s.kind }, req.ip);
  res.json({ ok: true, section: s });
});

router.delete('/guide/:id', (req, res) => {
  const s = getGuideSection(req.params.id);
  if (!s) return res.status(404).json({ error: 'بخش یافت نشد.' });
  deleteGuideSection(s.id);
  audit(req.user.id, 'guide_delete', { key: s.key }, req.ip);
  res.json({ ok: true });
});

/** Restore one section to its factory text */
router.post('/guide/:id/reset', (req, res) => {
  const r = resetGuideSection(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'بخش یافت نشد.' });
  if (r.notFactory) {
    return res.status(400).json({ error: 'این بخش را خودتان ساخته‌اید و متن کارخانه‌ای ندارد.' });
  }
  audit(req.user.id, 'guide_reset', { key: r.key }, req.ip);
  res.json({ ok: true, section: { ...r, modified: false } });
});

/* ==========================================================================
   Categories for published content
   ========================================================================== */
router.get('/categories', (req, res) => {
  res.json({ items: listCategories() });
});

router.post('/categories', (req, res) => {
  try {
    const c = createCategory(req.body || {});
    audit(req.user.id, 'category_create', { id: c.id, slug: c.slug }, req.ip);
    res.json({ ok: true, item: c });
  } catch (e) {
    res.status(e.code === 'DUPLICATE' ? 409 : 400).json({ error: e.message });
  }
});

router.put('/categories/:id', (req, res) => {
  try {
    const c = updateCategory(req.params.id, req.body || {});
    if (!c) return res.status(404).json({ error: 'دسته‌بندی یافت نشد.' });
    audit(req.user.id, 'category_update', { id: c.id, slug: c.slug }, req.ip);
    res.json({ ok: true, item: c });
  } catch (e) {
    res.status(e.code === 'DUPLICATE' ? 409 : 400).json({ error: e.message });
  }
});

router.delete('/categories/:id', (req, res) => {
  const c = getCategory(req.params.id);
  if (!c) return res.status(404).json({ error: 'دسته‌بندی یافت نشد.' });

  const used = countInCategory(c.id);
  if (used && !req.query.force) {
    return res.status(400).json({
      // Said plainly, because "will be deleted" is the assumption people make
      // and it is wrong here — the articles survive, they just lose the shelf.
      error: `${used} تحلیل منتشرشده در این دسته‌بندی است. با حذف آن، تحلیل‌ها پاک نمی‌شوند ولی بدون دسته‌بندی می‌مانند.`,
      needsForce: true, used
    });
  }

  deleteCategory(c.id);
  audit(req.user.id, 'category_delete', { id: c.id, slug: c.slug, used }, req.ip);
  res.json({ ok: true });
});
