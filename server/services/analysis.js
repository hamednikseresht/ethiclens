import { db, audit } from '../db.js';
import { streamChat } from './llm.js';
import { parseSections, makeTitle } from './parser.js';
import { checkCompleteness } from './completeness.js';
import { activePrompt, getSetting } from './settings.js';
import { modelsForTier, resolveModel, modelRef } from './providers.js';
import { checkAllowance } from './tiers.js';
import { USER_TEMPLATE } from './default-prompt.js';

/**
 * Shared analysis logic.
 *
 * Both the browser path (SSE) and the public API run through here, so that
 * quotas, model access and persistence behave identically on either route.
 */

export class AnalysisError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const MIN_LEN = 20;
const MAX_LEN = 8000;

/** Validate the input and normalise it into a standard shape */
export function normalizeInput(body = {}) {
  const dilemma = String(body.dilemma || '').trim();

  if (dilemma.length < MIN_LEN) {
    throw new AnalysisError(400,
      `شرح دوراهی باید حداقل ${MIN_LEN} نویسه باشد تا تحلیل معناداری ممکن شود.`,
      { code: 'dilemma_too_short' });
  }
  if (dilemma.length > MAX_LEN) {
    throw new AnalysisError(400,
      `شرح دوراهی خیلی بلند است (حداکثر ${MAX_LEN} نویسه).`,
      { code: 'dilemma_too_long' });
  }

  return {
    dilemma,
    context: {
      domain: String(body.domain || '').slice(0, 200),
      stakeholders: String(body.stakeholders || '').slice(0, 1000),
      options: String(body.options || '').slice(0, 2000),
      urgency: String(body.urgency || '').slice(0, 100),
      values: String(body.values || '').slice(0, 1000)
    },
    model: body.model ? String(body.model) : null
  };
}

/** Pick a model this user is allowed to run */
export function pickModel(user, requested) {
  const tier = user.tier;

  if (requested && !resolveModel(requested, tier)) {
    const existsForOthers = resolveModel(requested);
    throw new AnalysisError(403,
      existsForOthers
        ? 'این مدل فقط برای کاربران ویژه در دسترس است.'
        : 'مدل انتخاب‌شده در سامانه فعال نیست.',
      { code: existsForOthers ? 'model_requires_upgrade' : 'model_not_found' });
  }

  const chosen = resolveModel(requested, tier)
              || resolveModel(getSetting('default_model'), tier)
              || modelsForTier(tier)[0];

  if (!chosen) {
    throw new AnalysisError(503,
      'هیچ مدلی برای گروه شما فعال نیست. با مدیر سامانه تماس بگیرید.',
      { code: 'no_model_available' });
  }
  return chosen;
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v && String(v).trim() ? String(v).trim() : '— ذکر نشده —';
  });
}

/**
 * Run an analysis.
 *
 * onDelta is optional: when given, each chunk of text is emitted as it is
 * produced (streaming path). Without it the function waits and returns the
 * complete result (synchronous API path).
 *
 * onStart is optional too, and fires the moment the database row exists, so
 * the streaming path can send the id before generation begins.
 */
export async function runAnalysis({ user, input, onDelta, onStart, signal, source = 'web', ip }) {
  const allowance = checkAllowance(user);
  if (!allowance.ok) {
    throw new AnalysisError(429, allowance.error, { code: `quota_${allowance.reason}` });
  }

  const { dilemma, context, model: requested } = input;
  const chosen = pickModel(user, requested);
  const prompt = activePrompt();

  const messages = [
    { role: 'system', content: prompt.content },
    { role: 'user', content: fill(USER_TEMPLATE, { dilemma, ...context }) }
  ];

  const modelStr = modelRef(chosen);
  const row = db.prepare(`
    INSERT INTO analyses (user_id, title, dilemma, context, model, prompt_key, status)
    VALUES (?,?,?,?,?,?, 'pending')`)
    .run(user.id, makeTitle(dilemma), dilemma, JSON.stringify(context), modelStr, prompt.key);

  const analysisId = Number(row.lastInsertRowid);
  onStart?.({ analysisId, model: modelStr, label: chosen.label, provider: chosen.provider_label });

  const provider = {
    label: chosen.provider_label, base_url: chosen.base_url, api_key: chosen.api_key
  };
  const started = Date.now();

  try {
    const { text, usage, finishReason } = await streamChat({
      provider, messages, model: chosen.model_id, signal, onDelta
    });

    const sections = parseSections(text);
    const durationMs = Date.now() - started;

    // A resolved stream does not mean a complete answer. The response can be
    // cut off by a token ceiling or the model can drift off the block format,
    // and both cases arrive here looking like success. Record what is actually
    // missing so the row never claims to be more finished than it is.
    const completeness = checkCompleteness(sections);

    // finish_reason tells us *why* an answer is short, which the section scan
    // alone cannot: 'length' means the ceiling cut it off mid-sentence, and
    // that is a settings problem the admin can fix, not a flaky model.
    if (finishReason === 'length') {
      completeness.truncated = true;
      completeness.severity = completeness.complete ? 'partial' : completeness.severity;
      completeness.complete = false;
    }

    const status = completeness.complete ? 'done' : 'partial';

    db.prepare(`UPDATE analyses SET raw_output = ?, sections = ?, status = ?,
                completeness = ?, tokens_in = ?, tokens_out = ?, duration_ms = ? WHERE id = ?`)
      .run(text, JSON.stringify(sections), status, JSON.stringify(completeness),
           usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, durationMs, analysisId);

    audit(user.id, 'analyze',
          { analysisId, model: modelStr, durationMs, source, status,
            missing: completeness.missing.length + completeness.thin.length }, ip);

    return {
      analysisId, model: modelStr, modelLabel: chosen.label, provider: chosen.provider_label,
      text, sections, usage, durationMs, status, completeness
    };
  } catch (err) {
    const aborted = signal?.aborted;
    const message = aborted ? 'تحلیل لغو شد.' : (err.message || 'خطای ناشناخته.');
    db.prepare("UPDATE analyses SET status = 'error', error = ? WHERE id = ?")
      .run(message, analysisId);

    if (aborted) { const e = new AnalysisError(499, message, { code: 'aborted', analysisId }); throw e; }

    console.error('[analysis]', err);
    throw new AnalysisError(err.status && err.status < 600 ? 502 : 500, message,
                            { code: 'upstream_error', analysisId, detail: err.detail });
  }
}
