import { useMemo, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { fa } from '@/lib/fa';
import {
  PHASES, STAGE_SCHOOLS, splitVerdict, verdictState, VERDICT_STYLE,
  parseMatrix, MATRIX_COLUMNS, scoreStyle, scoreLabel, matrixTotals
} from '@/lib/analysis';
import { ChevronDown, TriangleAlert, RotateCcw } from 'lucide-react';

/**
 * The finished analysis.
 *
 * Reading order is the argument's order, not the model's output order: the
 * recommendation comes first because it is what the reader came for, then the
 * framing, then each gate with the schools that argue for it, then the
 * tensions and what to do. Someone who reads only the top gets the answer;
 * someone who reads on gets the reasoning that produced it.
 */
export default function Result({ analysis, meta, onNew }) {
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
    <div className="mx-auto max-w-xl px-5 pb-24 pt-6">
      {incomplete && <Gaps c={completeness} onNew={onNew} />}

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

      {sections.test && (
        <Block title="آزمون تصمیم" body={sections.test} className="mt-4" />
      )}

      <Matrix raw={sections.matrix} />

      {/* Framing: what the situation actually is, before any verdict. */}
      <Phase title={PHASES[0].title}>
        {PHASES[0].blocks.map(b => sections[b.key] && (
          <Block key={b.key} title={b.title} body={sections[b.key]} />
        ))}
      </Phase>

      <Phase title="پنج دروازه">
        {(meta?.gates || []).map(g => (
          <Gate key={g.key} gate={g} sections={sections} schools={schools} />
        ))}
      </Phase>

      {sections.tensions && (
        <Phase title={PHASES[1].title}>
          <Block title="تعارض میان مکاتب" body={sections.tensions} />
        </Phase>
      )}

      <Phase title={PHASES[3].title}>
        {PHASES[3].blocks.map(b => sections[b.key] && (
          <Block key={b.key} title={b.title} body={sections[b.key]} />
        ))}
      </Phase>

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
 * One gate and the schools that feed it.
 *
 * Collapsed by default. The verdict is the part most readers need; the
 * argument behind it is there for the ones who want to check the reasoning,
 * and showing all eight lenses expanded turns the page into a wall.
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
      <button onClick={() => setOpen(o => !o)}
              className="flex w-full items-start gap-3 p-5 text-start">
        <div className="grow space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold">{gate.title}</h3>
            {verdict && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${VERDICT_STYLE[state]}`}>
                {verdict}
              </span>
            )}
          </div>
          {gate.sub && <p className="text-[11px] text-text-5">{gate.sub}</p>}
        </div>
        <ChevronDown className={`mt-1 size-4 shrink-0 text-text-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          {rest && <Markdown className="text-[13px] text-text-2">{rest}</Markdown>}

          {feeders.map(k => {
            const s = schools[k];
            const sec = splitVerdict(sections[`school:${k}`]);
            return (
              <div key={k} className="mt-4 border-s-2 ps-4"
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
  if (!rows.length) return null;

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
              {MATRIX_COLUMNS.map(c => (
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
                {MATRIX_COLUMNS.map((c, k) => (
                  <td key={c.key} className="p-1 text-center">
                    <span dir="ltr"
                          className={`nums ltr inline-block w-7 rounded py-1 font-bold ${scoreStyle(r.scores[k])}`}>
                      {scoreLabel(r.scores[k])}
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
