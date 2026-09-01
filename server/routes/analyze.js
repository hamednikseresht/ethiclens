import express from 'express';
import { requireAuth, requireApproved } from '../middleware/auth.js';
import { getSetting } from '../services/settings.js';
import { enabledModels, modelsForTier, resolveModel, modelRef } from '../services/providers.js';
import { allowanceSummary } from '../services/tiers.js';
import { runAnalysis, normalizeInput, AnalysisError } from '../services/analysis.js';
import { SCHOOLS, GATES } from '../services/schools.js';

export const router = express.Router();

router.get('/meta', (req, res) => {
  const models = req.user ? modelsForTier(req.user.tier) : enabledModels();
  const fallback = models[0] ? modelRef(models[0]) : '';
  const configured = getSetting('default_model');
  const tierKey = req.user ? req.user.tier : null;
  const defaultModel = resolveModel(configured, tierKey) ? configured : fallback;

  res.json({
    schools: SCHOOLS,
    gates: GATES,
    defaultModel,
    // Models grouped by provider, for rendering as optgroups
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

router.get('/quota', requireAuth, (req, res) => {
  res.json(allowanceSummary(req.user));
});

/** SSE stream for the browser: events = start | delta | done | error */
router.post('/stream', requireAuth, requireApproved, async (req, res) => {
  let input;
  try {
    input = normalizeInput(req.body);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message, code: e.code });
  }

  // Client disconnect is detected on the response, not the request:
  // req emits close as soon as the request body finishes reading.
  const ac = new AbortController();
  let finished = false;
  let headersSent = false;
  let heartbeat = null;

  res.on('close', () => { if (!finished) ac.abort(); });

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const result = await runAnalysis({
      user: req.user,
      input,
      signal: ac.signal,
      source: 'web',
      ip: req.ip,
      onStart: info => {
        // Headers are held back until we know the work has started, so that
        // pre-start errors can still set a proper status code.
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        headersSent = true;
        heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
        send('start', info);
      },
      onDelta: chunk => send('delta', { t: chunk })
    });

    send('done', {
      analysisId: result.analysisId,
      sections: result.sections,
      usage: result.usage,
      durationMs: result.durationMs,
      status: result.status,
      completeness: result.completeness
    });
  } catch (err) {
    if (ac.signal.aborted) { /* the user is gone — send nothing */ }
    else if (headersSent) send('error', { message: err.message, code: err.code });
    else return res.status(err.status || 500).json({ error: err.message, code: err.code });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    finished = true;
    if (headersSent) res.end();
  }
});
