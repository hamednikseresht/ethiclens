import { num } from './settings.js';

/**
 * کلاینت عمومی برای هر API سازگار با OpenAI (انویدیا، اوپن‌ای‌آی، OpenRouter، …).
 * ارائه‌دهنده به شکل { label, base_url, api_key } داده می‌شود.
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

/**
 * فراخوانی استریمی chat/completions.
 * onDelta(text) برای هر تکه متن صدا زده می‌شود.
 * بازگشت: { text, usage, finishReason }
 */
export async function streamChat({ provider, messages, model, signal, onDelta, overrides = {} }) {
  const key = requireKey(provider);
  const url = endpoint(provider, '/chat/completions');

  const body = {
    model,
    messages,
    temperature: overrides.temperature ?? num('temperature', 0.6),
    top_p: overrides.top_p ?? num('top_p', 0.95),
    max_tokens: overrides.max_tokens ?? num('max_tokens', 4096),
    stream: true
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    const err = new Error(upstreamMessage(res.status, detail, provider));
    err.status = res.status;
    err.detail = detail.slice(0, 800);
    throw err;
  }

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
      // بعضی مدل‌های استدلالی متن را در reasoning_content می‌فرستند
      const delta = choice?.delta?.content ?? choice?.text ?? '';
      if (delta) { text += delta; onDelta?.(delta); }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (json.usage) usage = json.usage;
    }
  }

  return { text, usage, finishReason };
}

/** فهرست مدل‌های در دسترس روی حساب یک ارائه‌دهنده */
export async function listRemoteModels(provider) {
  const key = requireKey(provider);
  const res = await fetch(endpoint(provider, '/models'), {
    headers: { Authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(upstreamMessage(res.status, await res.text().catch(() => ''), provider));
  const json = await res.json();
  return (json.data || []).map(m => m.id).filter(Boolean).sort();
}

/** آزمایش سریع یک مدل با یک درخواست کوچک بدون استریم */
export async function pingModel(provider, model, timeoutMs = 45000) {
  const key = requireKey(provider);
  const started = Date.now();
  const res = await fetch(endpoint(provider, '/chat/completions'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'به فارسی فقط یک کلمه بنویس: سالم' }],
      max_tokens: 24, temperature: 0, stream: false
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const latencyMs = Date.now() - started;
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(upstreamMessage(res.status, detail, provider));
    err.status = res.status;
    err.detail = detail.slice(0, 400);
    throw err;
  }
  const j = await res.json();
  return { latencyMs, reply: (j.choices?.[0]?.message?.content || '').trim().slice(0, 120) };
}

function upstreamMessage(status, detail, provider) {
  const who = provider?.label || 'سرویس';
  let apiMsg = '';
  try {
    const j = JSON.parse(detail);
    apiMsg = j?.detail || j?.error?.message || j?.message || '';
  } catch { /* پاسخ متن خام */ }

  if (status === 401 || status === 403) return `کلید API «${who}» نامعتبر یا فاقد دسترسی است.`;
  if (status === 404) return `این مدل روی «${who}» در دسترس نیست؛ شناسه مدل را بررسی کنید.`;
  if (status === 410) return `این مدل روی «${who}» بازنشسته شده است. مدل دیگری انتخاب کنید.`;
  if (status === 429) return `محدودیت نرخ درخواست «${who}» فعال شد. کمی بعد دوباره تلاش کنید.`;
  if (status === 402) return `اعتبار حساب «${who}» کافی نیست.`;
  if (status >= 500) return `سرویس «${who}» موقتاً در دسترس نیست.`;
  return apiMsg ? `${who}: ${apiMsg}` : `خطای سرویس «${who}» (کد ${status}).`;
}
