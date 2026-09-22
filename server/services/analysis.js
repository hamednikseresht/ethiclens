import { db, audit } from '../db.js';
import { streamChat } from './llm.js';
import { parseSections, makeTitle } from './parser.js';
import { checkCompleteness, applyFinishReason, mergeSections } from './completeness.js';
import { activePrompt, getSetting } from './settings.js';
import { modelsForTier, resolveModel, modelRef } from './providers.js';
import { checkAllowance } from './tiers.js';
import { USER_TEMPLATE } from './default-prompt.js';
import { SECTION_KEYS } from './schools.js';

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

function parseJson(value, fallback) {
  try { return JSON.parse(value) || fallback; } catch { return fallback; }
}

function holesIn(completeness) {
  return [...(completeness?.missing || []), ...(completeness?.thin || [])];
}

/** Rebuild marked text from stored sections when raw_output was never saved. */
function rawFromSections(sections) {
  const src = sections && typeof sections === 'object' ? sections : {};
  return SECTION_KEYS
    .filter(k => src[k])
    .map(k => `@@${k}@@\n${src[k]}`)
    .join('\n\n');
}

function saveFinished(analysisId, {
  text, sections, status, completeness, usage, durationMs, tokensIn, tokensOut
}) {
  db.prepare(`UPDATE analyses SET raw_output = ?, sections = ?, status = ?,
              completeness = ?, tokens_in = ?, tokens_out = ?, duration_ms = ?,
              revised_at = datetime('now'), error = NULL WHERE id = ?`)
    .run(text, JSON.stringify(sections), status, JSON.stringify(completeness),
         tokensIn ?? usage?.prompt_tokens ?? 0,
         tokensOut ?? usage?.completion_tokens ?? 0,
         durationMs, analysisId);
}

function outcomeFromText(text, finishReason) {
  const sections = parseSections(text);
  const completeness = applyFinishReason(checkCompleteness(sections), finishReason);
  const status = completeness.complete ? 'done' : 'partial';
  return { sections, completeness, status };
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
  let acc = '';

  const persist = (body, finishReason, usage) => {
    const durationMs = Date.now() - started;
    const { sections, completeness, status } = outcomeFromText(body, finishReason);
    saveFinished(analysisId, { text: body, sections, status, completeness, usage, durationMs });
    audit(user.id, 'analyze',
          { analysisId, model: modelStr, durationMs, source, status,
            missing: completeness.missing.length + completeness.thin.length }, ip);
    return {
      analysisId, model: modelStr, modelLabel: chosen.label, provider: chosen.provider_label,
      text: body, sections, usage, durationMs, status, completeness
    };
  };

  try {
    const { text, usage, finishReason } = await streamChat({
      provider, messages, model: chosen.model_id, signal,
      onDelta: chunk => { acc += chunk; onDelta?.(chunk); }
    });

    const body = text || acc;
    if (!String(body).trim()) {
      const aborted = finishReason === 'abort' || signal?.aborted;
      const message = aborted ? 'تحلیل لغو شد.' : 'مدل متنی برنگرداند.';
      db.prepare("UPDATE analyses SET status = 'error', error = ? WHERE id = ?")
        .run(message, analysisId);
      if (aborted) throw new AnalysisError(499, message, { code: 'aborted', analysisId });
      throw new AnalysisError(502, message, { code: 'upstream_error', analysisId });
    }

    const result = persist(body, finishReason, usage);
    if (finishReason === 'abort' || signal?.aborted) {
      throw new AnalysisError(499, 'تحلیل لغو شد.', { code: 'aborted', analysisId });
    }
    return result;
  } catch (err) {
    if (err instanceof AnalysisError) throw err;

    const aborted = signal?.aborted;
    if (acc.trim()) {
      persist(acc, aborted ? 'abort' : 'error', null);
      if (aborted) throw new AnalysisError(499, 'تحلیل لغو شد.', { code: 'aborted', analysisId });
      // Upstream died after some tokens: hand the partial back so Gaps can
      // offer continue instead of a dead error screen.
      const durationMs = Date.now() - started;
      const { sections, completeness, status } = outcomeFromText(acc, 'error');
      return {
        analysisId, model: modelStr, modelLabel: chosen.label, provider: chosen.provider_label,
        text: acc, sections, usage: null, durationMs, status, completeness
      };
    }

    const message = aborted ? 'تحلیل لغو شد.' : (err.message || 'خطای ناشناخته.');
    db.prepare("UPDATE analyses SET status = 'error', error = ? WHERE id = ?")
      .run(message, analysisId);

    if (aborted) { const e = new AnalysisError(499, message, { code: 'aborted', analysisId }); throw e; }

    console.error('[analysis]', err);
    throw new AnalysisError(err.status && err.status < 600 ? 502 : 500, message,
                            { code: 'upstream_error', analysisId, detail: err.detail });
  }
}

/**
 * Fill the missing blocks of an existing analysis.
 *
 * Reuses the same row so it does not spend another daily quota slot. Monthly
 * tokens still count. The model is asked only for the @@keys@@ that
 * checkCompleteness still reports as missing or thin; those are merged in
 * and the rest of the document is left alone.
 */
export async function continueAnalysis({ user, analysisId, onDelta, onStart, signal, ip }) {
  const row = db.prepare('SELECT * FROM analyses WHERE id = ? AND user_id = ?')
                .get(analysisId, user.id);
  if (!row) throw new AnalysisError(404, 'تحلیل یافت نشد.', { code: 'not_found' });

  const previous = parseJson(row.sections, {});
  const stored = checkCompleteness(previous);
  const needed = holesIn(stored);
  if (!needed.length) {
    throw new AnalysisError(400, 'بخش جاافتاده‌ای برای ادامه نمانده است.', { code: 'already_complete' });
  }

  const priorRaw = (row.raw_output || '').trim() || rawFromSections(previous);
  if (!priorRaw) {
    throw new AnalysisError(400, 'متنی برای ادامه نیست. یک تحلیل تازه شروع کنید.', { code: 'nothing_to_continue' });
  }

  const allowance = checkAllowance(user, { countTowardDaily: false });
  if (!allowance.ok) {
    throw new AnalysisError(429, allowance.error, { code: `quota_${allowance.reason}` });
  }

  const chosen = resolveModel(row.model, user.tier) || pickModel(user, null);
  const prompt = activePrompt();
  const context = parseJson(row.context, {});
  const modelStr = modelRef(chosen);

  const continueUser =
    `تحلیل قبلی ناقص مانده است. فقط بلوک‌های جاافتاده را بنویس.\n\n` +
    `کلیدهای لازم:\n${needed.map(k => `@@${k}@@`).join('\n')}\n\n` +
    `قوانین:\n` +
    `- فقط همین بلوک‌ها را بنویس؛ بلوک‌های کامل را تکرار نکن\n` +
    `- هر بلوک را با همان خط نشانه‌گذاری @@KEY@@ شروع کن و بعد متن فارسی را بنویس\n` +
    `- برای هر بلوک چند جمله واقعی بنویس، نه یک عبارت کوتاه`;

  const messages = [
    { role: 'system', content: prompt.content },
    { role: 'user', content: fill(USER_TEMPLATE, { dilemma: row.dilemma, ...context }) },
    { role: 'assistant', content: priorRaw },
    { role: 'user', content: continueUser }
  ];

  db.prepare("UPDATE analyses SET status = 'pending', error = NULL WHERE id = ?").run(analysisId);
  onStart?.({
    analysisId, continuing: true, missing: needed,
    model: modelStr, label: chosen.label, provider: chosen.provider_label
  });

  const provider = {
    label: chosen.provider_label, base_url: chosen.base_url, api_key: chosen.api_key
  };
  const started = Date.now();
  let acc = '';

  const persist = (incomingText, finishReason, usage) => {
    const incoming = parseSections(incomingText);
    const sections = mergeSections(previous, incoming, needed);
    const completeness = applyFinishReason(checkCompleteness(sections), finishReason);
    const status = completeness.complete ? 'done' : 'partial';
    const text = priorRaw + (String(incomingText || '').trim() ? `\n\n${String(incomingText).trim()}` : '');
    const durationMs = (row.duration_ms || 0) + (Date.now() - started);
    saveFinished(analysisId, {
      text, sections, status, completeness, usage, durationMs,
      tokensIn: (row.tokens_in || 0) + (usage?.prompt_tokens ?? 0),
      tokensOut: (row.tokens_out || 0) + (usage?.completion_tokens ?? 0)
    });
    audit(user.id, 'analyze_continue',
          { analysisId, model: modelStr, status, filled: needed.length }, ip);
    return {
      analysisId, model: modelStr, modelLabel: chosen.label, provider: chosen.provider_label,
      text, sections, usage, durationMs, status, completeness, continuing: true
    };
  };

  try {
    const { text, usage, finishReason } = await streamChat({
      provider, messages, model: chosen.model_id, signal,
      onDelta: chunk => { acc += chunk; onDelta?.(chunk); }
    });

    const result = persist(text || acc, finishReason, usage);
    if (finishReason === 'abort' || signal?.aborted) {
      throw new AnalysisError(499, 'تحلیل لغو شد.', { code: 'aborted', analysisId });
    }
    return result;
  } catch (err) {
    if (err instanceof AnalysisError) throw err;

    const aborted = signal?.aborted;
    if (acc.trim()) {
      persist(acc, aborted ? 'abort' : 'error', null);
      if (aborted) throw new AnalysisError(499, 'تحلیل لغو شد.', { code: 'aborted', analysisId });
      const durationMs = (row.duration_ms || 0) + (Date.now() - started);
      const sections = mergeSections(previous, parseSections(acc), needed);
      const completeness = applyFinishReason(checkCompleteness(sections), 'error');
      return {
        analysisId, model: modelStr, modelLabel: chosen.label, provider: chosen.provider_label,
        text: priorRaw + `\n\n${acc.trim()}`, sections, usage: null, durationMs,
        status: completeness.complete ? 'done' : 'partial', completeness, continuing: true
      };
    }

    const message = aborted ? 'ادامه تحلیل لغو شد.' : (err.message || 'خطای ناشناخته.');
    db.prepare("UPDATE analyses SET status = 'partial', error = ? WHERE id = ?")
      .run(message, analysisId);
    if (aborted) throw new AnalysisError(499, message, { code: 'aborted', analysisId });
    console.error('[analysis:continue]', err);
    throw new AnalysisError(err.status && err.status < 600 ? 502 : 500, message,
                            { code: 'upstream_error', analysisId, detail: err.detail });
  }
}
