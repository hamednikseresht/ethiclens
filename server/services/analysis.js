import { db, audit } from '../db.js';
import { streamChat } from './llm.js';
import { parseSections, makeTitle } from './parser.js';
import { activePrompt, getSetting } from './settings.js';
import { modelsForTier, resolveModel, modelRef } from './providers.js';
import { checkAllowance } from './tiers.js';
import { USER_TEMPLATE } from './default-prompt.js';

/**
 * منطق مشترک اجرای تحلیل.
 *
 * هم مسیر مرورگر (SSE) و هم API عمومی از همین‌جا استفاده می‌کنند، تا
 * سقف‌ها، دسترسی مدل و ذخیره‌سازی در هر دو مسیر دقیقاً یکسان اعمال شود.
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

/** ورودی را می‌سنجد و به شکل استاندارد درمی‌آورد */
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

/** مدل مجاز برای این کاربر را انتخاب می‌کند */
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
 * تحلیل را اجرا می‌کند.
 *
 * onDelta اختیاری است: اگر داده شود، هر تکه متن حین تولید فرستاده می‌شود
 * (مسیر استریمی). اگر ندهید، تابع تا پایان صبر می‌کند و نتیجه کامل را
 * برمی‌گرداند (مسیر همگام API).
 *
 * onStart هم اختیاری است و به‌محض ساخته‌شدن ردیف پایگاه داده صدا زده
 * می‌شود، تا مسیر استریمی بتواند شناسه را پیش از شروع تولید بفرستد.
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
    const { text, usage } = await streamChat({
      provider, messages, model: chosen.model_id, signal, onDelta
    });

    const sections = parseSections(text);
    const durationMs = Date.now() - started;

    db.prepare(`UPDATE analyses SET raw_output = ?, sections = ?, status = 'done',
                tokens_in = ?, tokens_out = ?, duration_ms = ? WHERE id = ?`)
      .run(text, JSON.stringify(sections),
           usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, durationMs, analysisId);

    audit(user.id, 'analyze', { analysisId, model: modelStr, durationMs, source }, ip);

    return {
      analysisId, model: modelStr, modelLabel: chosen.label, provider: chosen.provider_label,
      text, sections, usage, durationMs
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
