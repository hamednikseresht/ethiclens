import { splitVerdict } from '@/lib/analysis';

/**
 * Native share for an analysis, with clipboard as the fallback.
 *
 * Unpublished analyses have no address another person can open, so those
 * shares are title plus the recommendation — never /app/?id=, which would
 * 403 for anyone else. Published ones include the public page.
 *
 * Must run from a user gesture. navigator.share rejects with AbortError
 * when the sheet is dismissed; that is not a failure.
 *
 * @returns {'shared' | 'copied' | 'cancelled'}
 */
export async function shareAnalysis(analysis) {
  const payload = sharePayload(analysis);

  if (typeof navigator.share === 'function') {
    try {
      if (!navigator.canShare || navigator.canShare(payload)) {
        await navigator.share(payload);
        return 'shared';
      }
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }

  const lines = [payload.title, payload.text, payload.url].filter(Boolean);
  await navigator.clipboard.writeText(lines.join('\n\n'));
  return 'copied';
}

export function sharePayload(analysis) {
  const title = analysis.public_title || analysis.title || 'دیدگاه اخلاق';
  const rec = splitVerdict(analysis.sections?.recommendation || '');
  const text = clip(
    rec.verdict
    || analysis.public_summary
    || rec.rest
    || analysis.excerpt
    || ''
  );
  const url = publicUrl(analysis);

  if (url) return { title, text, url };
  return { title, text: [title, text].filter(Boolean).join('\n\n') };
}

function publicUrl(analysis) {
  if (!analysis?.is_public || !analysis.slug) return '';
  const cat = analysis.category_slug || 'public';
  return `${location.origin}/analysis/${cat}/${encodeURIComponent(analysis.slug)}`;
}

function clip(s, n = 280) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trimEnd() + '…';
}
