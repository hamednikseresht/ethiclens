import { useMemo, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { fa } from '@/lib/fa';
import {
  PHASES, STAGE_SCHOOLS, splitVerdict, verdictState, VERDICT_STYLE,
  parseMatrix, scoredColumns, scoreStyle, scoreLabel, matrixTotals
} from '@/lib/analysis';
import { ChevronDown, TriangleAlert, RotateCcw } from 'lucide-react';
import { AnalysisActions, Reflection } from '@/components/AnalysisActions';

/**
 * The finished analysis.
 *
 * Reading order is the argument's order, not the model's output order:
 *
 *   1. the recommendation — what the reader came for
 *   2. the framing: is this even an ethical problem, restated, the facts,
 *      who is affected, and what the options actually are
 *   3. the matrix, which scores those options against all eight lenses
 *   4. the five gates, each with the lenses that argue for it
 *   5. where the lenses disagree, and the three tests
 *   6. carrying it out, and when to look at it again
 *
 * Someone who reads only the top gets the answer; someone who reads on gets
 * the reasoning that produced it, in the order it was built. The matrix sits
 * directly under the options because it is a table *of* them — a reader
 * meeting it before the options had to scroll back to learn what «گزینه الف»
 * referred to.
 */
export default function Result({ analysis, meta, onNew, onUpdated }) {
  const sections = analysis.sections || {};
  const schools = useMemo(
    () => Object.fromEntries((meta?.schools || []).map(s => [s.key, s])),
    [meta]
  );
  const gates = useMemo(
    () => Object.fromEntries((meta?.gates || []).map(g => [g.key, g])),
    [meta]
  );

  const completeness = analysis.completeness;
  const incomplete = completeness && !completeness.complete;

  const rec = splitVerdict(sections.recommendation || '');

  return (
    <div className="mx-auto max-w-xl md:max-w-2xl px-5 pb-24 pt-6">
      {incomplete && <Gaps c={completeness} onNew={onNew} />}

      <h1 className="mb-3 text-[15px] font-bold leading-relaxed">{analysis.title}</h1>

      {onUpdated && (
        <div className="mb-4">
          <AnalysisActions analysis={analysis} onUpdated={onUpdated} />
        </div>
      )}

      <GateStrip sections={sections} gates={gates} />

      {/* The answer, on a dark surface so it reads as the conclusion rather
          than one section among twenty-six. */}
      {sections.recommendation && (
        <section className="mt-5 rounded-xl bg-ink p-5 text-background">
          <span className="text-[10px] font-bold tracking-wide opacity-60">مسیر پیشنهادی</span>
          {rec.verdict && (
            <p className="display mt-2 text-[25px] font-medium leading-relaxed">{rec.verdict}</p>
          )}
          <Markdown className="mt-3 text-[13px] leading-[2] opacity-90">{rec.rest || sections.recommendation}</Markdown>
        </section>
      )}

      {/* Framing: what the situation actually is, before any verdict. */}
      <Phase title={PHASES[0].title}>
        {PHASES[0].blocks.map(b => sections[b.key] && (
          b.key === 'options'
            ? <Options key={b.key} title={b.title} body={sections.options} />
            : <Block key={b.key} title={b.title} body={sections[b.key]} />
        ))}
      </Phase>

      <Matrix raw={sections.matrix} />

      <Phase title="پنج دروازه و هشت لنز">
        {(meta?.gates || []).map(g => (
          <Gate key={g.key} gate={g} sections={sections} schools={schools} />
        ))}
      </Phase>

      {sections.tensions && (
        <Phase title={PHASES[1].title}>
          <Block title="تعارض میان مکاتب" body={sections.tensions} />
        </Phase>
      )}

      {sections.test && (
        <Phase title="آزمون تصمیم">
          <Block title="آزمون تصمیم" body={sections.test} />
        </Phase>
      )}

      <Phase title={PHASES[3].title}>
        {PHASES[3].blocks.map(b => sections[b.key] && (
          <Block key={b.key} title={b.title} body={sections[b.key]} />
        ))}
      </Phase>

      {/* Phase five sits after the argument because that is when it happens:
          you read, you decide, and only then is there something to record. */}
      {onUpdated && <Reflection analysis={analysis} onUpdated={onUpdated} />}

      <p className="mt-8 rounded-md border border-border bg-subtle p-4 text-[11px] leading-loose text-text-4">
        این تحلیل با کمک یک مدل زبانی تولید شده و می‌تواند خطا داشته باشد.
        تصمیم نهایی و مسئولیت آن با شماست. دیدگاه اخلاق جایگزین مشاوره حقوقی،
        پزشکی یا روان‌شناختی نیست.
      </p>

      <Button variant="outline" className="mt-4 w-full" onClick={onNew}>
        تحلیل تازه
      </Button>
    </div>
  );
}

/* ---------------- Incomplete result ---------------- */
function Gaps({ c, onNew }) {
  const missing = [...(c.missing || []), ...(c.thin || [])];
  return (
    <Alert variant={c.severity === 'critical' ? 'destructive' : 'warn'} className="mb-5">
      <div className="flex gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-2">
          <p className="font-bold">
            {c.severity === 'critical' ? 'بخش‌های کلیدی جا مانده‌اند' : 'برخی بخش‌ها کامل نشدند'}
          </p>
          <p className="text-xs leading-loose">
            مدل {fa(c.present)} بخش از {fa(c.total)} بخش را برگرداند
            {c.truncated && ' و پاسخ وسط کار بریده شد'}.
            آنچه پایین می‌بینید ناقص است.
          </p>
          <Button size="sm" variant="outline" onClick={onNew}>
            <RotateCcw className="size-3.5" /> دوباره تحلیل کن
          </Button>
        </div>
      </div>
    </Alert>
  );
}

/* ---------------- Gate verdicts at a glance ---------------- */
function GateStrip({ sections, gates }) {
  const items = Object.keys(gates).map(key => {
    const { verdict } = splitVerdict(sections[`gate:${key}`] || '');
    return { key, title: gates[key].title, verdict, state: verdictState(verdict) };
  }).filter(g => g.verdict);

  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(g => (
        <span key={g.key}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${VERDICT_STYLE[g.state]}`}>
          {g.title}: {g.verdict}
        </span>
      ))}
    </div>
  );
}

/* ---------------- Layout pieces ---------------- */
function Phase({ title, children }) {
  const kids = Array.isArray(children) ? children.filter(Boolean) : children;
  if (!kids || (Array.isArray(kids) && !kids.length)) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[10px] font-bold tracking-wide text-text-5">{title}</h2>
      <div className="space-y-3">{kids}</div>
    </section>
  );
}

function Block({ title, body, className = '' }) {
  if (!body) return null;
  return (
    <article className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <h3 className="mb-2 text-sm font-bold">{title}</h3>
      <Markdown className="text-[13px] text-text-2">{body}</Markdown>
    </article>
  );
}

/**
 * The options, as separate cards rather than a bullet list.
 *
 * These are the things being decided between, and every later section refers
 * back to them by name — the matrix scores them row by row, the gates rule on
 * them, the recommendation picks one. As four dashes in a paragraph they were
 * the least distinct part of the page despite being the most referred-to, so
 * each gets a card and the letter the rest of the analysis calls it by.
 *
 * The model is asked for «- گزینه الف: توضیح». Anything that does not split
 * on a colon is still shown, just without a separate heading — a parser that
 * dropped those lines would silently lose an option.
 */
function Options({ title, body }) {
  const items = useMemo(() => {
    return String(body || '').split('\n')
      .map(l => l.trim())
      .filter(l => /^[-*•–]\s+/.test(l))
      .map(l => {
        const text = l.replace(/^[-*•–]\s+/, '');
        const m = text.match(/^(.{1,40}?)\s*[:：]\s*(.+)$/s);
        return m
          ? { label: m[1].replace(/[*`]/g, '').trim(), desc: m[2].trim() }
          : { label: null, desc: text };
      });
  }, [body]);

  if (!items.length) return <Block title={title} body={body} />;

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      <ol className="space-y-2.5">
        {items.map((o, i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-border bg-subtle p-3.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full
                             bg-primary-soft text-[11px] font-bold text-primary">
              {fa(i + 1)}
            </span>
            <div className="min-w-0 grow space-y-1">
              {o.label && <p className="text-[13px] font-bold leading-relaxed">{o.label}</p>}
              <Markdown className="text-[12.5px] text-text-3">{o.desc}</Markdown>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

/**
 * One gate and the lenses that feed it.
 *
 * The gate's own one-or-two-sentence finding is always visible: that is the
 * summary, and hiding it behind a chevron meant the section collapsed to a
 * row of verdict chips with no reasoning on screen at all. What expands is
 * the lens-by-lens argument underneath — two to eight paragraphs per gate,
 * which shown open turns the page into a wall.
 */
function Gate({ gate, sections, schools }) {
  const [open, setOpen] = useState(false);
  const body = sections[`gate:${gate.key}`];
  if (!body) return null;

  const { verdict, rest } = splitVerdict(body);
  const state = verdictState(verdict);
  const feeders = (STAGE_SCHOOLS[gate.key] || []).filter(k => sections[`school:${k}`]);

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">{gate.title}</h3>
          {verdict && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${VERDICT_STYLE[state]}`}>
              {verdict}
            </span>
          )}
        </div>
        {gate.sub && <p className="mt-1.5 text-[11px] text-text-5">{gate.sub}</p>}
        {rest && <Markdown className="mt-2.5 text-[13px] text-text-2">{rest}</Markdown>}

        {Boolean(feeders.length) && (
          <button onClick={() => setOpen(o => !o)} aria-expanded={open}
                  className="mt-3 flex items-center gap-1.5 text-[11.5px] font-bold text-primary">
            {open ? 'بستن' : `دیدن ${fa(feeders.length)} لنز این دروازه`}
            <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          {feeders.map(k => {
            const s = schools[k];
            const sec = splitVerdict(sections[`school:${k}`]);
            return (
              <div key={k} className="mt-4 border-s-2 ps-4 first:mt-0"
                   style={{ borderColor: s?.color || 'var(--color-border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: s?.color }}>
                    {s?.name || k}
                  </span>
                  {s?.thinker && <span className="text-[10px] text-text-5">{s.thinker}</span>}
                  {sec.verdict && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${VERDICT_STYLE[verdictState(sec.verdict)]}`}>
                      {sec.verdict}
                    </span>
                  )}
                </div>
                <Markdown className="mt-1.5 text-[12.5px] text-text-3">{sec.rest}</Markdown>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

/* ---------------- Comparison matrix ---------------- */
function Matrix({ raw }) {
  const rows = useMemo(() => parseMatrix(raw), [raw]);
  const cols = useMemo(() => scoredColumns(rows), [rows]);
  if (!rows.length || !cols.length) return null;

  const { totals, best } = matrixTotals(rows);

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[10px] font-bold tracking-wide text-text-5">ماتریس سنجش</h2>

      {/* The table is wider than a phone. It scrolls inside its own box so the
          page itself never scrolls sideways. */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-border">
              <th className="p-2.5 text-start font-bold">گزینه</th>
              {cols.map(c => (
                <th key={c.key} className="p-2 text-center font-bold whitespace-nowrap">{c.label}</th>
              ))}
              <th className="p-2 text-center font-bold">جمع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="p-2.5 font-bold">
                  {r.option}
                  {totals[i] === best && (
                    <span className="ms-1.5 rounded-full bg-ok-soft px-1.5 py-0.5 text-[9px] text-ok">
                      بالاترین
                    </span>
                  )}
                </td>
                {cols.map(c => (
                  <td key={c.key} className="p-1 text-center">
                    <span dir="ltr"
                          className={`nums ltr inline-block w-7 rounded py-1 font-bold ${scoreStyle(r.scores[c.i])}`}>
                      {scoreLabel(r.scores[c.i])}
                    </span>
                  </td>
                ))}
                <td className="p-2 text-center">
                  <span dir="ltr" className="nums ltr font-bold">{fa(totals[i])}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-loose text-text-5">
        جمع ستون‌ها راهنمای بصری است، نه حکم نهایی. دو ستون نخست — کرامت و
        عدالت — <strong className="text-text-3">وتوکننده</strong>اند: امتیاز
        منفی در آن‌ها را نمی‌توان با امتیاز مثبت ستون‌های دیگر جبران کرد.
      </p>
    </section>
  );
}
