/**
 * API client.
 *
 * The server authenticates with a session cookie and guards every mutating
 * request with a double-submit CSRF token, so this layer has two jobs beyond
 * fetch: send credentials, and attach the token the session issued.
 *
 * The token is read once at boot from /api/auth/me and kept in memory. It is
 * refreshed whenever a response carries a new one, because logging in
 * regenerates the session and therefore the token — using the stale one would
 * make the first request after sign-in fail with a confusing 403.
 */

let csrf = null;

export function setCsrf(token) {
  if (token) csrf = token;
}

export function getCsrf() {
  return csrf;
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const method = options.method || 'GET';

  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;

  const res = await fetch(path, {
    ...options,
    method,
    headers,
    // Same-origin in production; in development Vite proxies /api to Express
    // so the cookie still travels with the request.
    credentials: 'same-origin',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }

  if (data?.csrf) setCsrf(data.csrf);

  if (!res.ok) {
    throw new ApiError(data?.error || `خطای ${res.status}`, res.status, data);
  }
  return data;
}

export const api = {
  get:  (p)       => request(p),
  post: (p, body) => request(p, { method: 'POST', body: body ?? {} }),
  put:  (p, body) => request(p, { method: 'PUT',  body: body ?? {} }),
  del:  (p)       => request(p, { method: 'DELETE' })
};

/**
 * Run an analysis over Server-Sent Events.
 *
 * Written against fetch rather than EventSource for two reasons: EventSource
 * cannot POST, and it cannot be aborted cleanly. The analysis needs both — it
 * sends the dilemma in the body, and a user who leaves must not leave the
 * model running.
 *
 * The `finished` flag matters. The response's close event also fires on normal
 * completion, and treating that as an abort would cancel the request just as
 * it succeeded.
 */
export async function streamAnalysis(payload, { onStart, onDelta, onDone, signal }) {
  const res = await fetch('/api/analyze/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let body = null;
    try { body = JSON.parse(text); } catch { /* non-JSON response */ }
    throw new ApiError(body?.error || 'تحلیل شروع نشد.', res.status, body);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let event = null, data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
        // A line starting with ':' is the server's keep-alive ping, which is
        // what stops Cloudflare timing the connection out mid-analysis.
      }
      if (!event || !data) continue;

      let payload;
      try { payload = JSON.parse(data); } catch { continue; }

      if (event === 'start') onStart?.(payload);
      else if (event === 'delta') onDelta?.(payload.t);
      else if (event === 'done') onDone?.(payload);
      else if (event === 'error') throw new ApiError(payload.message, 502, payload);
    }
  }
}
