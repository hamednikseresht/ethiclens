import { apiKey, getSetting, num } from './settings.js';

/**
 * فراخوانی استریمی chat/completions سازگار با OpenAI روی NVIDIA NIM.
 * onDelta(text) برای هر تکه متن صدا زده می‌شود.
 * مقدار بازگشتی: { text, usage, finishReason }
 */
export async function streamChat({ messages, model, signal, onDelta, overrides = {} }) {
  const key = apiKey();
  if (!key) {
    const err = new Error('کلید API انویدیا تنظیم نشده است. از پنل مدیریت آن را وارد کنید.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const baseUrl = (getSetting('nvidia_base_url') || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
  const body = {
    model,
    messages,
    temperature: overrides.temperature ?? num('temperature', 0.6),
    top_p: overrides.top_p ?? num('top_p', 0.95),
    max_tokens: overrides.max_tokens ?? num('max_tokens', 4096),
    stream: true
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
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
    const err = new Error(upstreamMessage(res.status, detail));
    err.status = res.status;
    err.detail = detail.slice(0, 800);
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let text = '';
  let usage = null;
  let finishReason = null;

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
      const delta = choice?.delta?.content ?? choice?.text ?? '';
      if (delta) { text += delta; onDelta?.(delta); }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (json.usage) usage = json.usage;
    }
  }

  return { text, usage, finishReason };
}

function upstreamMessage(status, detail) {
  let apiMsg = '';
  try { apiMsg = JSON.parse(detail)?.detail || JSON.parse(detail)?.error?.message || ''; } catch { /* متن خام */ }
  if (status === 401 || status === 403) return 'کلید API انویدیا نامعتبر یا فاقد دسترسی است.';
  if (status === 404) return 'این مدل روی سرویس انویدیا یافت نشد؛ شناسه مدل را در پنل مدیریت بررسی کنید.';
  if (status === 429) return 'محدودیت نرخ درخواست انویدیا فعال شد. کمی بعد دوباره تلاش کنید.';
  if (status >= 500) return 'سرویس انویدیا موقتاً در دسترس نیست.';
  return apiMsg || `خطای سرویس هوش مصنوعی (کد ${status}).`;
}

/** فهرست مدل‌های در دسترس روی حساب کاربر */
export async function listRemoteModels() {
  const key = apiKey();
  if (!key) throw new Error('کلید API تنظیم نشده است.');
  const baseUrl = (getSetting('nvidia_base_url') || '').replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(upstreamMessage(res.status, await res.text().catch(() => '')));
  const json = await res.json();
  return (json.data || []).map(m => m.id).filter(Boolean).sort();
}
