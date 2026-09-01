import { num } from './settings.js';

/**
 * Generic client for any OpenAI-compatible API (NVIDIA, OpenAI, OpenRouter, …).
 * The provider arrives as { label, base_url, api_key }.
 */

function endpoint(provider, path) {
  const base = String(provider?.base_url || '').replace(/\/+$/, '');
  if (!base) {
    const e = new Error(`آدرس پایه برای «${provider?.label || 'ارائه‌دهنده'}» تنظیم نشده است.`);
    e.code = 'NO_BASE_URL';
    throw e;
  }
  return `${base}${path}`;
}

function requireKey(provider) {
  const key = provider?.api_key || '';
  if (!key) {
    const e = new Error(`کلید API برای «${provider?.label || 'ارائه‌دهنده'}» تنظیم نشده است. از پنل مدیریت آن را وارد کنید.`);
    e.code = 'NO_API_KEY';
    throw e;
  }
  return key;
}

/* ==========================================================================
   سازگاری پارامترها میان نسل‌های مختلف مدل‌ها
   --------------------------------------------------------------------------
   خانواده‌های تازه اوپن‌ای‌آی (GPT-5 و سری o) به‌جای max_tokens پارامتر
   max_completion_tokens می‌خواهند و temperature/top_p سفارشی را رد می‌کنند.
   دو لایه دفاع داریم:
     ۱. حدسِ اولیه از روی نام مدل (تا درخواست اول هم درست باشد)
     ۲. تطبیق خودکار پس از خطای ۴۰۰ (تا مدل‌های آینده هم کار کنند)
   ========================================================================== */

/** Models that require max_completion_tokens instead of max_tokens */
const NEW_PARAM_STYLE = /(^|\/)(o[1-9](-|$|\d)|gpt-5|gpt-4\.5)/i;

/** Models that accept only the default temperature */
const FIXED_SAMPLING = /(^|\/)(o[1-9](-|$|\d)|gpt-5)/i;

function buildBody({ model, messages, overrides, stream, quirks = {} }) {
  const maxTokens = overrides.max_tokens ?? num('max_tokens', 4096);
  const body = { model, messages };
  if (stream) body.stream = true;

  const useCompletionTokens = quirks.completionTokens ?? NEW_PARAM_STYLE.test(model);
  if (useCompletionTokens) body.max_completion_tokens = maxTokens;
  else body.max_tokens = maxTokens;

  const fixedSampling = quirks.fixedSampling ?? FIXED_SAMPLING.test(model);
  if (!fixedSampling) {
    body.temperature = overrides.temperature ?? num('temperature', 0.6);
    body.top_p = overrides.top_p ?? num('top_p', 0.95);
  }
  return body;
}

/** Work out from the service's error text which parameter it objected to */
function quirksFromError(detail, current = {}) {
  const text = String(detail || '').toLowerCase();
  const next = { ...current };
  let changed = false;

  if (/max_tokens.*not supported|use ['"]?max_completion_tokens|unsupported parameter: ['"]?max_tokens/.test(text)
      && !current.completionTokens) {
    next.completionTokens = true;
    changed = true;
  }
  if (/(temperature|top_p).*(not supported|unsupported|does not support)/.test(text)
      && !current.fixedSampling) {
    next.fixedSampling = true;
    changed = true;
  }
  return changed ? next : null;
}

/**
 * Send the request; if the service complains about a parameter, retry once
 * with corrected parameters.
 */
async function postChat({ provider, key, model, messages, overrides, stream, signal, timeoutMs }) {
  let quirks = {};

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(endpoint(provider, '/chat/completions'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(stream ? { 'Accept': 'text/event-stream' } : {})
      },
      body: JSON.stringify(buildBody({ model, messages, overrides, stream, quirks })),
      signal: signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined)
    });

    if (res.ok && (!stream || res.body)) return res;

    const detail = await res.text().catch(() => '');

    // Is this something a parameter change could fix?
    if (res.status === 400 && attempt === 0) {
      const adjusted = quirksFromError(detail, quirks);
      if (adjusted) {
        quirks = adjusted;
        console.warn(`[llm] «${model}» پارامترهای متفاوتی می‌خواهد — تلاش دوباره`,
                     JSON.stringify(quirks));
        continue;
      }
    }

    const err = new Error(upstreamMessage(res.status, detail, provider));
    err.status = res.status;
    err.detail = detail.slice(0, 800);
    throw err;
  }
}

/**
 * Streaming chat/completions call.
 * onDelta(text) fires for each chunk of text.
 * Returns { text, usage, finishReason }.
 */
export async function streamChat({ provider, messages, model, signal, onDelta, overrides = {} }) {
  const key = requireKey(provider);
  const res = await postChat({ provider, key, model, messages, overrides, stream: true, signal });

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '', text = '', usage = null, finishReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;

      let json;
      try { json = JSON.parse(payload); } catch { continue; }

      const choice = json.choices?.[0];
          // Some reasoning models put the text in reasoning_content instead
      const delta = choice?.delta?.content ?? choice?.text ?? '';
      if (delta) { text += delta; onDelta?.(delta); }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (json.usage) usage = json.usage;
    }
  }

  return { text, usage, finishReason };
}

/** Models available on a given provider account */
export async function listRemoteModels(provider) {
  const key = requireKey(provider);
  const res = await fetch(endpoint(provider, '/models'), {
    headers: { Authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(upstreamMessage(res.status, await res.text().catch(() => ''), provider));
  const json = await res.json();
  return (json.data || []).map(m => m.id).filter(Boolean).sort();
}

/** Quick probe of one model with a small non-streaming request */
export async function pingModel(provider, model, timeoutMs = 45000) {
  const key = requireKey(provider);
  const started = Date.now();

  const res = await postChat({
    provider, key, model,
    messages: [{ role: 'user', content: 'به فارسی فقط یک کلمه بنویس: سالم' }],
  // Reasoning models spend part of the budget thinking, so allow more headroom
    overrides: { max_tokens: 256, temperature: 0 },
    stream: false, timeoutMs
  });

  const latencyMs = Date.now() - started;
  const j = await res.json();
  return { latencyMs, reply: (j.choices?.[0]?.message?.content || '').trim().slice(0, 120) };
}

function upstreamMessage(status, detail, provider) {
  const who = provider?.label || 'سرویس';
  let apiMsg = '';
  try {
    const j = JSON.parse(detail);
    apiMsg = j?.detail || j?.error?.message || j?.message || '';
    } catch { /* plain-text response */ }

  if (status === 401 || status === 403) return `کلید API «${who}» نامعتبر یا فاقد دسترسی است.`;
  if (status === 404) return `این مدل روی «${who}» در دسترس نیست؛ شناسه مدل را بررسی کنید.`;
  if (status === 410) return `این مدل روی «${who}» بازنشسته شده است. مدل دیگری انتخاب کنید.`;
  if (status === 429) return `محدودیت نرخ درخواست «${who}» فعال شد. کمی بعد دوباره تلاش کنید.`;
  if (status === 402) return `اعتبار حساب «${who}» کافی نیست.`;
  if (status >= 500) return `سرویس «${who}» موقتاً در دسترس نیست.`;
  return apiMsg ? `${who}: ${apiMsg}` : `خطای سرویس «${who}» (کد ${status}).`;
}
