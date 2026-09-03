/**
 * Probe one provider's API directly from .env, without touching the database.
 *
 * The normal path reads keys from the settings table, which needs the native
 * sqlite binding. This script deliberately avoids that so a provider can be
 * diagnosed on a machine where the binding will not build, and so the answer
 * comes from the provider itself rather than from the app's assumptions.
 *
 *   node scripts/probe-provider.mjs deepseek
 *   node scripts/probe-provider.mjs openai gpt-4.1-mini
 *
 * It answers, per model, the four things that actually differ between
 * OpenAI-compatible services: which token parameter is accepted, whether a
 * custom temperature is allowed, what the real max_tokens ceiling is, and
 * whether the streamed answer arrives in `content` or somewhere else.
 */
import fs from 'node:fs';
import path from 'node:path';

/* ---- Minimal .env reader: dotenv itself may not be installed ---- */
function readEnv(file = '.env') {
  const out = {};
  let raw;
  try { raw = fs.readFileSync(path.resolve(file), 'utf8'); }
  catch { return out; }

  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnv(), ...process.env };

const PROVIDERS = {
  nvidia:   { key: 'NVIDIA_API_KEY',   url: 'NVIDIA_BASE_URL',   fallback: 'https://integrate.api.nvidia.com/v1' },
  openai:   { key: 'OPENAI_API_KEY',   url: 'OPENAI_BASE_URL',   fallback: 'https://api.openai.com/v1' },
  deepseek: { key: 'DEEPSEEK_API_KEY', url: 'DEEPSEEK_BASE_URL', fallback: 'https://api.deepseek.com/v1' }
};

const name = (process.argv[2] || '').toLowerCase();
const spec = PROVIDERS[name];
if (!spec) {
  console.error(`  ارائه‌دهنده را بدهید: ${Object.keys(PROVIDERS).join(' | ')}`);
  process.exit(1);
}

const apiKey = env[spec.key] || '';
const baseUrl = (env[spec.url] || spec.fallback).replace(/\/+$/, '');

if (!apiKey || /^sk-x+$/i.test(apiKey) || /^nvapi-x+$/i.test(apiKey)) {
  console.error(`  ${spec.key} در .env پر نشده است.`);
  process.exit(1);
}

const call = async (body, timeout = 120000) => {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json,
           err: json?.error?.message || json?.message || text.slice(0, 200) };
};

const MSG = [{ role: 'user', content: 'به فارسی فقط یک کلمه بنویس: سالم' }];

/* ---- Which models to look at ---- */
let models = process.argv.slice(3);
if (!models.length) {
  const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) { console.error(`  فهرست مدل‌ها گرفته نشد: ${res.status}`); process.exit(1); }
  models = ((await res.json()).data || []).map(m => m.id).filter(Boolean).sort();
}

console.log(`\n  ارائه‌دهنده: ${name}   نشانی: ${baseUrl}`);
console.log(`  مدل‌ها: ${models.join(', ')}\n`);

for (const model of models) {
  const row = { model, token: '?', temp: '?', ceiling: '?', field: '?' };

  // 1. classic parameters
  const classic = await call({ model, messages: MSG, max_tokens: 64, temperature: 0.6, top_p: 0.95 });
  if (classic.ok) { row.token = 'max_tokens'; row.temp = 'ok'; }
  else {
    const e = classic.err.toLowerCase();
    if (/max_completion_tokens/.test(e)) row.token = 'max_completion_tokens';
    if (/temperature/.test(e)) row.temp = 'ثابت';
    if (classic.status === 404) { console.log(`  ${model.padEnd(22)} روی این حساب نیست`); continue; }
  }

  // 2. modern parameters, when the classic shape was refused
  if (!classic.ok) {
    const modern = await call({ model, messages: MSG, max_completion_tokens: 64 });
    if (modern.ok) { row.token = 'max_completion_tokens'; if (row.temp === '?') row.temp = 'ثابت'; }
    else row.ceiling = `خطا: ${modern.err.slice(0, 90)}`;
  }

  // 3. The real ceiling. Sent deliberately high: a service that caps lower
  //    says so in the error, which is the number the app needs to respect.
  const param = row.token === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens';
  const high = await call({ model, messages: MSG, [param]: 16000 });
  row.ceiling = high.ok ? '≥۱۶۰۰۰ (رد نشد)' : `رد شد → ${high.err.slice(0, 110)}`;

  // 4. Where streamed text actually arrives
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: MSG, stream: true, [param]: 64 }),
      signal: AbortSignal.timeout(120000)
    });
    const rd = res.body.getReader(); const dec = new TextDecoder();
    let buf = '', content = 0, reasoning = 0, usage = false;
    while (true) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!l.startsWith('data:')) continue;
        const p = l.slice(5).trim(); if (p === '[DONE]') continue;
        let j; try { j = JSON.parse(p); } catch { continue; }
        if (j.choices?.[0]?.delta?.content) content++;
        if (j.choices?.[0]?.delta?.reasoning_content) reasoning++;
        if (j.usage) usage = true;
      }
    }
    row.field = `content:${content} reasoning_content:${reasoning} usage:${usage ? 'بله' : 'خیر'}`;
  } catch (e) { row.field = `استریم ناموفق: ${String(e.message).slice(0, 60)}`; }

  console.log(`  ${row.model}`);
  console.log(`      پارامتر توکن : ${row.token}`);
  console.log(`      temperature  : ${row.temp}`);
  console.log(`      سقف          : ${row.ceiling}`);
  console.log(`      استریم       : ${row.field}\n`);
}
