/**
 * Turns raw model output into marked sections.
 * Markers are lines of the form  @@key@@  and nothing else.
 */
const MARKER = /^\s*@@\s*([a-zA-Z:_-]+)\s*@@\s*$/;

export function parseSections(text) {
  const sections = {};
  let current = null;
  let buf = [];

  const flush = () => {
    if (current) sections[current] = buf.join('\n').trim();
    buf = [];
  };

  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(MARKER);
    if (m) { flush(); current = m[1]; }
    else if (current) buf.push(line);
  }
  flush();
  return sections;
}

/** Pull a leading verdict line off the front of a section body */
export function extractVerdict(body) {
  if (!body) return { verdict: null, body: '' };
  const lines = body.split(/\r?\n/);
  const first = lines[0]?.trim() ?? '';
  const m = first.match(/^(?:حکم|وضعیت)\s*[:：]\s*(.+)$/);
  if (m) return { verdict: m[1].replace(/[*_`]/g, '').trim(), body: lines.slice(1).join('\n').trim() };
  return { verdict: null, body };
}

/** Short title derived from the dilemma text, for the history list */
export function makeTitle(dilemma) {
  const clean = String(dilemma || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'دوراهی بدون عنوان';
  return clean.length <= 70 ? clean : clean.slice(0, 70).replace(/\s\S*$/, '') + '…';
}
