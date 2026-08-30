import express from 'express';
import { db, audit } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { streamChat } from '../services/llm.js';
import { parseSections, makeTitle } from '../services/parser.js';
import { activePrompt, getSetting } from '../services/settings.js';
import { enabledModels, resolveModel, modelRef } from '../services/providers.js';
import { USER_TEMPLATE } from '../services/default-prompt.js';
import { SCHOOLS, GATES } from '../services/schools.js';

export const router = express.Router();

router.get('/meta', (req, res) => {
  const models = enabledModels();
  const fallback = models[0] ? modelRef(models[0]) : '';
  const configured = getSetting('default_model');
  const defaultModel = resolveModel(configured) ? configured : fallback;

  res.json({
    schools: SCHOOLS,
    gates: GATES,
    defaultModel,
    // مدل‌ها گروه‌بندی‌شده بر اساس ارائه‌دهنده، برای نمایش در optgroup
    providers: groupByProvider(models),
    models: models.map(m => ({
      ref: modelRef(m), label: m.label, note: m.note,
      provider: m.provider_label, providerKey: m.provider_key
    }))
  });
});

function groupByProvider(models) {
  const out = [];
  for (const m of models) {
    let g = out.find(x => x.key === m.provider_key);
    if (!g) { g = { key: m.provider_key, label: m.provider_label, models: [] }; out.push(g); }
    g.models.push({ ref: modelRef(m), label: m.label, note: m.note });
  }
  return out;
}

function usedToday(userId) {
  return db.prepare(`SELECT COUNT(*) c FROM analyses
                     WHERE user_id = ? AND date(created_at) = date('now')`).get(userId).c;
}

router.get('/quota', requireAuth, (req, res) => {
  const used = usedToday(req.user.id);
  res.json({ used, limit: req.user.daily_quota, remaining: Math.max(0, req.user.daily_quota - used) });
});

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v && String(v).trim() ? String(v).trim() : '— ذکر نشده —';
  });
}

/** استریم SSE: رویدادها = start | delta | done | error */
router.post('/stream', requireAuth, async (req, res) => {
  const dilemma = String(req.body?.dilemma || '').trim();
  if (dilemma.length < 20) {
    return res.status(400).json({ error: 'شرح دوراهی باید حداقل ۲۰ نویسه باشد تا تحلیل معناداری ممکن شود.' });
  }
  if (dilemma.length > 8000) {
    return res.status(400).json({ error: 'شرح دوراهی خیلی بلند است (حداکثر ۸۰۰۰ نویسه).' });
  }

  const used = usedToday(req.user.id);
  if (used >= req.user.daily_quota) {
    return res.status(429).json({ error: `سهمیه امروز شما (${req.user.daily_quota} تحلیل) تمام شده است.` });
  }

  const ctx = {
    domain: String(req.body?.domain || '').slice(0, 200),
    stakeholders: String(req.body?.stakeholders || '').slice(0, 1000),
    options: String(req.body?.options || '').slice(0, 2000),
    urgency: String(req.body?.urgency || '').slice(0, 100),
    values: String(req.body?.values || '').slice(0, 1000)
  };

  const chosen = resolveModel(req.body?.model) || resolveModel(getSetting('default_model')) || enabledModels()[0];
  if (!chosen) {
    return res.status(503).json({ error: 'هیچ مدلی در سامانه فعال نیست. با مدیر سامانه تماس بگیرید.' });
  }

  const provider = {
    label: chosen.provider_label, base_url: chosen.base_url, api_key: chosen.api_key
  };

  const prompt = activePrompt();
  const messages = [
    { role: 'system', content: prompt.content },
    { role: 'user', content: fill(USER_TEMPLATE, { dilemma, ...ctx }) }
  ];

  const stored = modelRef(chosen);
  const row = db.prepare(`INSERT INTO analyses (user_id, title, dilemma, context, model, prompt_key, status)
                          VALUES (?,?,?,?,?,?, 'pending')`)
    .run(req.user.id, makeTitle(dilemma), dilemma, JSON.stringify(ctx), stored, prompt.key);
  const analysisId = Number(row.lastInsertRowid);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('start', { analysisId, model: stored, label: chosen.label, provider: chosen.provider_label });

  // قطع اتصال کاربر را از روی پاسخ تشخیص می‌دهیم، نه درخواست:
  // req رویداد close را به‌محض کامل‌شدن بدنه درخواست هم می‌فرستد.
  const ac = new AbortController();
  let finished = false;
  res.on('close', () => { if (!finished) ac.abort(); });

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  const started = Date.now();

  try {
    const { text, usage } = await streamChat({
      provider, messages, model: chosen.model_id, signal: ac.signal,
      onDelta: chunk => send('delta', { t: chunk })
    });

    const sections = parseSections(text);
    const duration = Date.now() - started;

    db.prepare(`UPDATE analyses SET raw_output = ?, sections = ?, status = 'done',
                tokens_in = ?, tokens_out = ?, duration_ms = ? WHERE id = ?`)
      .run(text, JSON.stringify(sections), usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, duration, analysisId);

    send('done', { analysisId, sections, usage, durationMs: duration });
    audit(req.user.id, 'analyze', { analysisId, model: stored, durationMs: duration }, req.ip);
  } catch (err) {
    const message = ac.signal.aborted ? 'تحلیل توسط کاربر لغو شد.' : (err.message || 'خطای ناشناخته.');
    db.prepare("UPDATE analyses SET status = 'error', error = ? WHERE id = ?").run(message, analysisId);
    if (!ac.signal.aborted) {
      console.error('[analyze]', err);
      send('error', { message });
    }
  } finally {
    clearInterval(heartbeat);
    finished = true;
    res.end();
  }
});
