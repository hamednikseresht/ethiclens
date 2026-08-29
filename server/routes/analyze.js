import express from 'express';
import { db, audit } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { streamChat } from '../services/nvidia.js';
import { parseSections, makeTitle } from '../services/parser.js';
import { activePrompt, getSetting, enabledModels } from '../services/settings.js';
import { USER_TEMPLATE } from '../services/default-prompt.js';
import { SCHOOLS, GATES } from '../services/schools.js';

export const router = express.Router();

router.get('/meta', (req, res) => {
  res.json({
    schools: SCHOOLS,
    gates: GATES,
    models: enabledModels().map(m => ({ id: m.model_id, label: m.label, note: m.note })),
    defaultModel: getSetting('default_model')
  });
});

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

/** استریم SSE: رویدادها = delta | section | done | error */
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

  const allowed = enabledModels().map(m => m.model_id);
  const requested = String(req.body?.model || '');
  const model = allowed.includes(requested) ? requested : (getSetting('default_model') || allowed[0]);
  if (!model) return res.status(500).json({ error: 'هیچ مدلی در سامانه فعال نیست.' });

  const prompt = activePrompt();
  const messages = [
    { role: 'system', content: prompt.content },
    { role: 'user', content: fill(USER_TEMPLATE, { dilemma, ...ctx }) }
  ];

  const row = db.prepare(`INSERT INTO analyses (user_id, title, dilemma, context, model, prompt_key, status)
                          VALUES (?,?,?,?,?,?, 'pending')`)
    .run(req.user.id, makeTitle(dilemma), dilemma, JSON.stringify(ctx), model, prompt.key);
  const analysisId = Number(row.lastInsertRowid);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('start', { analysisId, model });

  const ac = new AbortController();
  req.on('close', () => ac.abort());
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  const started = Date.now();

  try {
    const { text, usage } = await streamChat({
      messages, model, signal: ac.signal,
      onDelta: chunk => send('delta', { t: chunk })
    });

    const sections = parseSections(text);
    const duration = Date.now() - started;

    db.prepare(`UPDATE analyses SET raw_output = ?, sections = ?, status = 'done',
                tokens_in = ?, tokens_out = ?, duration_ms = ? WHERE id = ?`)
      .run(text, JSON.stringify(sections), usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, duration, analysisId);

    send('done', { analysisId, sections, usage, durationMs: duration });
    audit(req.user.id, 'analyze', { analysisId, model, durationMs: duration }, req.ip);
  } catch (err) {
    const message = ac.signal.aborted ? 'تحلیل توسط کاربر لغو شد.' : (err.message || 'خطای ناشناخته.');
    db.prepare("UPDATE analyses SET status = 'error', error = ? WHERE id = ?").run(message, analysisId);
    if (!ac.signal.aborted) {
      console.error('[analyze]', err);
      send('error', { message });
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});
