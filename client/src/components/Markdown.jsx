import { Fragment } from 'react';

/**
 * The small markdown subset the model actually emits: paragraphs, bullet and
 * numbered lists, bold, italic and inline code.
 *
 * Rendered as React elements rather than an HTML string. The old page built
 * HTML and injected it, which works but means every future change to this
 * renderer is one escaping mistake away from putting model output into the
 * DOM as markup. Elements cannot do that — text stays text no matter what the
 * model writes.
 */

/** Split one line into bold / italic / code runs. */
function inline(text, keyBase) {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|(?:^|[\s(])\*[^*\n]+\*)/g;
  let last = 0, m, i = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];

    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyBase}-b${i++}`} className="font-bold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={`${keyBase}-c${i++}`} className="ltr rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      // Italic keeps whatever whitespace preceded the asterisk, so words do
      // not run together when the emphasis is mid-sentence.
      const lead = token.match(/^[\s(]/)?.[0] ?? '';
      const body = token.slice(lead.length + 1, -1);
      parts.push(<Fragment key={`${keyBase}-i${i++}`}>{lead}<em className="italic">{body}</em></Fragment>);
    }
    last = m.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

export function Markdown({ children, className = '' }) {
  const src = String(children || '').replace(/\r/g, '');
  if (!src.trim()) return null;

  const blocks = [];
  let list = null;          // { type: 'ul' | 'ol', items: [] }
  let para = [];
  let n = 0;

  // Justified, which is how Persian body text is set: the eye follows a
  // straight left edge down the column instead of a ragged one. Applied to
  // paragraphs only — a justified list item or table cell is short enough
  // that stretching it opens gaps rather than closing an edge.
  const flushPara = () => {
    if (!para.length) return;
    blocks.push(
      <p key={`p${n++}`} className="mb-3 text-justify leading-[2] last:mb-0">
        {inline(para.join(' '), `p${n}`)}
      </p>
    );
    para = [];
  };

  const flushList = () => {
    if (!list) return;
    const Tag = list.type;
    blocks.push(
      <Tag key={`l${n++}`}
           className={`mb-3 space-y-1.5 ps-5 leading-[1.9] last:mb-0 ${
             list.type === 'ol' ? 'list-decimal' : 'list-disc'}`}>
        {list.items.map((it, k) => <li key={k}>{inline(it, `l${n}-${k}`)}</li>)}
      </Tag>
    );
    list = null;
  };

  for (const raw of src.split('\n')) {
    const t = raw.trim();

    if (!t) { flushPara(); flushList(); continue; }

    const ol = t.match(/^(\d+)[.)]\s+(.*)$/);
    const ul = t.match(/^[-*•–]\s+(.*)$/);

    if (ol) {
      flushPara();
      if (list?.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(ol[2]);
    } else if (ul) {
      flushPara();
      if (list?.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(ul[1]);
    } else {
      flushList();
      para.push(t);
    }
  }
  flushPara();
  flushList();

  return <div className={className}>{blocks}</div>;
}
