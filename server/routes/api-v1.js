import express from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { runAnalysis, normalizeInput, AnalysisError } from '../services/analysis.js';
import { modelsForTier, modelRef } from '../services/providers.js';
import { allowanceSummary } from '../services/tiers.js';
import { SCHOOLS, STAGES } from '../services/schools.js';

/**
 * API عمومی نسخه ۱ — برای استفاده برنامه‌ای.
 *
 * احراز هویت با سربرگ  Authorization: Bearer eth_…
 * همان سقف‌های گروه کاربری اعمال می‌شود که در وب اعمال می‌شود.
 */
export const router = express.Router();

/** فقط با کلید API — نه نشست مرورگر. جلوی سوءاستفاده CSRF-مانند از مرورگر را می‌گیرد. */
function requireApiKey(req, res, next) {
  if (!req.apiKey) {
    return res.status(401).json({
      error: 'این مسیر فقط با کلید API کار می‌کند. سربرگ Authorization: Bearer eth_… را بفرستید.',
      code: 'api_key_required',
      docs: '/docs/api'
    });
  }
  next();
}

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `k${req.apiKey?.id || req.ip}`,
  message: { error: 'بیش از حد درخواست فرستادید. حداکثر ۱۰ تحلیل در دقیقه.', code: 'rate_limited' }
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `k${req.apiKey?.id || req.ip}`
});

router.use(requireApiKey, requireAuth);

/* ---------------- شناسایی ---------------- */
router.get('/me', readLimiter, (req, res) => {
  res.json({
    user: {
      id: req.user.id, name: req.user.name, email: req.user.email,
      tier: req.user.tier, emailVerified: !!req.user.email_verified
    },
    key: { id: req.apiKey.id, name: req.apiKey.name, prefix: req.apiKey.prefix },
    allowance: allowanceSummary(req.user)
  });
});

/* ---------------- مدل‌ها و چارچوب ---------------- */
router.get('/models', readLimiter, (req, res) => {
  res.json({
    default: modelsForTier(req.user.tier)[0] ? modelRef(modelsForTier(req.user.tier)[0]) : null,
    models: modelsForTier(req.user.tier).map(m => ({
      id: modelRef(m), label: m.label, note: m.note, provider: m.provider_label
    }))
  });
});

router.get('/framework', readLimiter, (req, res) => {
  res.json({
    schools: SCHOOLS.map(s => ({ key: s.key, name: s.name, thinker: s.thinker, question: s.question })),
    stages: STAGES.map(s => ({
      key: s.key, n: s.n, kind: s.kind, title: s.title,
      thinker: s.thinker, question: s.question, rule: s.rule, schools: s.schools
    }))
  });
});

/* ---------------- تحلیل همگام ---------------- */
router.post('/analyze', analyzeLimiter, requireVerified, async (req, res) => {
  try {
    const input = normalizeInput(req.body);
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });

    const r = await runAnalysis({
      user: req.user, input, signal: ac.signal, source: 'api', ip: req.ip
    });

    res.json({
      id: r.analysisId,
      model: r.model,
      modelLabel: r.modelLabel,
      provider: r.provider,
      durationMs: r.durationMs,
      usage: r.usage
        ? { promptTokens: r.usage.prompt_tokens, completionTokens: r.usage.completion_tokens }
        : null,
      sections: r.sections,
      raw: req.body?.includeRaw === true ? r.text : undefined,
      url: `/analysis?id=${r.analysisId}`
    });
  } catch (e) {
    if (e instanceof AnalysisError) {
      if (e.status === 499) return;              // کاربر قطع کرده
      return res.status(e.status).json({ error: e.message, code: e.code });
    }
    console.error('[api/analyze]', e);
    res.status(500).json({ error: 'خطای داخلی سرور.', code: 'internal_error' });
  }
});

/* ---------------- تحلیل استریمی ---------------- */
router.post('/analyze/stream', analyzeLimiter, requireVerified, async (req, res) => {
  let input;
  try { input = normalizeInput(req.body); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message, code: e.code }); }

  const ac = new AbortController();
  let started = false, finished = false, heartbeat = null;
  res.on('close', () => { if (!finished) ac.abort(); });

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const r = await runAnalysis({
      user: req.user, input, signal: ac.signal, source: 'api', ip: req.ip,
      onStart: info => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        started = true;
        heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
        send('start', { id: info.analysisId, model: info.model, provider: info.provider });
      },
      onDelta: chunk => send('delta', { text: chunk })
    });
    send('done', { id: r.analysisId, sections: r.sections, usage: r.usage, durationMs: r.durationMs });
  } catch (e) {
    if (ac.signal.aborted) { /* رفته */ }
    else if (started) send('error', { error: e.message, code: e.code });
    else return res.status(e.status || 500).json({ error: e.message, code: e.code });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    finished = true;
    if (started) res.end();
  }
});

/* ---------------- خواندن تحلیل‌ها ---------------- */
router.get('/analyses', readLimiter, (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = Math.max(0, parseInt(req.query.offset) || 0);

  const total = db.prepare('SELECT COUNT(*) c FROM analyses WHERE user_id = ?').get(req.user.id).c;
  const items = db.prepare(`
    SELECT id, title, model, status, created_at, duration_ms, tokens_in, tokens_out,
           is_favorite, decision, reflected_at
    FROM analyses WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(req.user.id, limit, offset);

  res.json({
    total, limit, offset,
    items: items.map(a => ({
      id: a.id, title: a.title, model: a.model, status: a.status,
      createdAt: a.created_at, durationMs: a.duration_ms,
      usage: { promptTokens: a.tokens_in, completionTokens: a.tokens_out },
      isFavorite: !!a.is_favorite,
      decision: a.decision, reflectedAt: a.reflected_at
    }))
  });
});

router.get('/analyses/:id', readLimiter, (req, res) => {
  const a = db.prepare('SELECT * FROM analyses WHERE id = ? AND user_id = ?')
              .get(req.params.id, req.user.id);
  if (!a) return res.status(404).json({ error: 'تحلیل یافت نشد.', code: 'not_found' });

  const safe = (s, f) => { try { return JSON.parse(s); } catch { return f; } };
  res.json({
    id: a.id, title: a.title, dilemma: a.dilemma, context: safe(a.context, {}),
    model: a.model, status: a.status, error: a.error,
    createdAt: a.created_at, durationMs: a.duration_ms,
    usage: { promptTokens: a.tokens_in, completionTokens: a.tokens_out },
    sections: safe(a.sections, {}),
    raw: req.query.includeRaw === 'true' ? a.raw_output : undefined,
    decision: a.decision, reflection: a.reflection, reflectedAt: a.reflected_at,
    isFavorite: !!a.is_favorite
  });
});

router.delete('/analyses/:id', readLimiter, (req, res) => {
  const info = db.prepare('DELETE FROM analyses WHERE id = ? AND user_id = ?')
                 .run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'تحلیل یافت نشد.', code: 'not_found' });
  res.json({ ok: true });
});

/* ---------------- ثبت بازنگری ---------------- */
router.post('/analyses/:id/reflection', readLimiter, (req, res) => {
  const own = db.prepare('SELECT id FROM analyses WHERE id = ? AND user_id = ?')
                .get(req.params.id, req.user.id);
  if (!own) return res.status(404).json({ error: 'تحلیل یافت نشد.', code: 'not_found' });

  const decision = String(req.body?.decision || '').trim().slice(0, 300);
  const reflection = String(req.body?.reflection || '').trim().slice(0, 4000);

  db.prepare(`UPDATE analyses SET decision = ?, reflection = ?, reflected_at = datetime('now')
              WHERE id = ?`).run(decision || null, reflection || null, own.id);

  res.json({ ok: true, decision, reflection });
});

/* ---------------- مسیر ناشناخته ---------------- */
router.use((req, res) => {
  res.status(404).json({
    error: `مسیر ${req.method} ${req.baseUrl}${req.path} در API نسخه ۱ وجود ندارد.`,
    code: 'route_not_found',
    docs: '/docs/api'
  });
});
