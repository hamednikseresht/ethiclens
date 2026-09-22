import { useMemo, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent
} from '@/components/ui/accordion';
import { fa } from '@/lib/fa';
import {
  PHASES, STAGE_SCHOOLS, splitVerdict, verdictState, VERDICT_STYLE,
  parseMatrix, scoredColumns, scoreStyle, scoreLabel, matrixTotals
} from '@/lib/analysis';
import { ChevronDown, TriangleAlert, RotateCcw, Play, Loader2 } from 'lucide-react';
import { AnalysisActions, Reflection } from '@/components/AnalysisActions';
import { streamContinue } from '@/lib/api';
import { completenessMessage } from '@contract/completeness.js';

/**
 * The finished analysis, as a scan then a read.
 *
 * The inverted recommendation slab put a wall of white type on black at the
 * top of every result. The verdict is now a pull-quote on the page itself;
 * the rest of the document sits behind four tabs so twenty-six blocks are
 * not all open at once. Reading order is unchanged: answer, then options,
 * then the matrix, then the argument, then what to do.
 */
export default function Result({ analysis, meta, onNew, onRevisit, onUpdated }) {
  const sections = analysis.sections || {};
  const schools = useMemo(
    () => Object.fromEntries((meta?.schools || []).map(s => [s.key, s])),
    [meta]
  );

  const completeness = analysis.completeness;
  const incomplete = completeness && !completeness.complete;
  const rec = splitVerdict(sections.recommendation || '');

  const frameBlocks = PHASES[0].blocks.filter(b => b.key !== 'options' && sections[b.key]);
  const actBlocks = PHASES[3].blocks.filter(b => sections[b.key]);
  const gates = (meta?.gates || []).filter(g => sections[`gate:${g.key}`]);
  const hasMatrix = Boolean(sections.matrix);
  const hasReason = gates.length > 0 || sections.tensions || sections.test;
  const hasAct = actBlocks.length > 0 || Boolean(onUpdated);
  const defaultTab = (sections.options || frameBlocks.length) ? 'summary'
    : hasMatrix ? 'matrix'
    : hasReason ? 'reason'
    : 'act';

  return (
    <div className="mx-auto max-w-xl md:max-w-2xl px-5 pb-24 pt-6">
      {incomplete && (
        <Gaps c={completeness} analysisId={analysis.id}
              onNew={onNew} onRevisit={onRevisit} onUpdated={onUpdated} />
      )}

      <p className="text-[13px] leading-relaxed text-muted-foreground">{analysis.title}</p>

      {onUpdated && (
        <div className="mt-3">
          <AnalysisActions analysis={analysis} onUpdated={onUpdated} />
          {onRevisit && !incomplete && (
            <Button size="sm" variant="outline" onClick={onRevisit} className="mt-2 h-8 rounded-full px-3 text-xs">
              <RotateCcw className="size-3.5" aria-hidden="true" />
              تحلیل دوباره
            </Button>
          )}
        </div>
      )}

      {sections.recommendation && (
        <blockquote className="mt-6 border-s-2 border-foreground ps-4">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground">مسیر پیشنهادی</p>
          {rec.verdict && (
            <p className="display mt-2 text-[22px] font-medium leading-snug text-balance">
              {rec.verdict}
            </p>
          )}
          {(rec.rest || (!rec.verdict && sections.recommendation)) && (
            <ExpandableMarkdown body={rec.rest || sections.recommendation} />
          )}
        </blockquote>
      )}

      <div className="mt-5">
        <GateStrip sections={sections} gates={Object.fromEntries(gates.map(g => [g.key, g]))} />
      </div>

      <Tabs defaultValue={defaultTab} className="mt-6">
        <TabsList className="h-auto min-h-11 w-full">
          <TabsTrigger value="summary" className="min-h-11">خلاصه</TabsTrigger>
          {hasMatrix && <TabsTrigger value="matrix" className="min-h-11">سنجش</TabsTrigger>}
          {hasReason && <TabsTrigger value="reason" className="min-h-11">استدلال</TabsTrigger>}
          {hasAct && <TabsTrigger value="act" className="min-h-11">عمل</TabsTrigger>}
        </TabsList>

        <TabsContent value="summary">
          {sections.options && <Options title="گزینه‌های موجود" body={sections.options} />}
          {frameBlocks.length > 0 && (
            <Accordion type="multiple" className="mt-3 space-y-2">
              {frameBlocks.map(b => (
                <AccordionItem key={b.key} value={b.key}>
                  <AccordionTrigger>{b.title}</AccordionTrigger>
                  <AccordionContent>
                    <Markdown className="text-[13px] text-text-2">{sections[b.key]}</Markdown>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </TabsContent>

        {hasMatrix && (
          <TabsContent value="matrix">
            <Matrix raw={sections.matrix} options={sections.options} />
          </TabsContent>
        )}

        {hasReason && (
          <TabsContent value="reason">
            {gates.length > 0 && (
              <Accordion type="single" collapsible className="space-y-2">
                {gates.map(g => (
                  <Gate key={g.key} gate={g} sections={sections} schools={schools} />
                ))}
              </Accordion>
            )}
            {(sections.tensions || sections.test) && (
              <Accordion type="multiple" className="mt-3 space-y-2">
                {sections.tensions && (
                  <AccordionItem value="tensions">
                    <AccordionTrigger>تعارض میان مکاتب</AccordionTrigger>
                    <AccordionContent>
                      <Markdown className="text-[13px] text-text-2">{sections.tensions}</Markdown>
                    </AccordionContent>
                  </AccordionItem>
                )}
                {sections.test && (
                  <AccordionItem value="test">
                    <AccordionTrigger>آزمون تصمیم</AccordionTrigger>
                    <AccordionContent>
                      <Markdown className="text-[13px] text-text-2">{sections.test}</Markdown>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            )}
          </TabsContent>
        )}

        {hasAct && (
          <TabsContent value="act">
            {actBlocks.length > 0 && (
              <Accordion type="multiple" className="space-y-2">
                {actBlocks.map(b => (
                  <AccordionItem key={b.key} value={b.key}>
                    <AccordionTrigger>{b.title}</AccordionTrigger>
                    <AccordionContent>
                      <Markdown className="text-[13px] text-text-2">{sections[b.key]}</Markdown>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            {onUpdated && <div className="mt-4"><Reflection analysis={analysis} onUpdated={onUpdated} /></div>}
          </TabsContent>
        )}
      </Tabs>

      <p className="mt-8 text-[11px] leading-relaxed text-text-5">
        این تحلیل با کمک یک مدل زبانی تولید شده و می‌تواند خطا داشته باشد.
        تصمیم نهایی با شماست.
      </p>

      {onNew && (
        <Button variant="ghost" className="mt-3 w-full text-muted-foreground" onClick={onNew}>
          تحلیل تازه
        </Button>
      )}
    </div>
  );
}

const CLAMP_CHARS = 220;

function ExpandableMarkdown({ body }) {
  const text = String(body || '').trim();
  const long = text.length > CLAMP_CHARS;
  const [open, setOpen] = useState(false);
  if (!text) return null;

  return (
    <div className="mt-3">
      <div className={long && !open ? 'line-clamp-3' : undefined}>
        <Markdown className="text-[13px] leading-relaxed text-text-2">{text}</Markdown>
      </div>
      {long && (
        <Button type="button" variant="ghost" size="sm"
                className="mt-1 h-11 px-2 text-xs"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}>
          {open ? 'کمتر' : 'ادامه'}
        </Button>
      )}
    </div>
  );
}

function Gaps({ c, analysisId, onNew, onRevisit, onUpdated }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const holes = [...(c.missing || []), ...(c.thin || [])];
  const canContinue = Boolean(analysisId && onUpdated && holes.length);

  const resume = async () => {
    if (!canContinue || running) return;
    setRunning(true);
    setError('');
    try {
      await streamContinue(analysisId, {
        onDone: (r) => {
          onUpdated({
            sections: r.sections,
            completeness: r.completeness,
            status: r.status
          });
        }
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Alert variant={c.severity === 'critical' ? 'destructive' : 'warn'} className="mb-5">
      <div className="flex gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-2">
          <p className="font-bold">
            {c.severity === 'critical' ? 'بخش‌های کلیدی جا مانده‌اند' : 'برخی بخش‌ها کامل نشدند'}
          </p>
          <p className="text-xs leading-relaxed">
            مدل {fa(c.present)} بخش از {fa(c.total)} بخش را برگرداند
            {c.truncated && ' و پاسخ وسط کار بریده شد'}.
            {holes.length > 0 && ` ${completenessMessage(c)}`}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {canContinue && (
              <Button size="sm" variant="primary" onClick={resume} disabled={running}>
                {running
                  ? <><Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> در حال ادامه…</>
                  : <><Play className="size-3.5" aria-hidden="true" /> ادامه بده</>}
              </Button>
            )}
            {(onRevisit || onNew) && (
              <Button size="sm" variant="outline"
                      onClick={onRevisit || onNew} disabled={running}>
                <RotateCcw className="size-3.5" aria-hidden="true" /> دوباره تحلیل کن
              </Button>
            )}
          </div>
        </div>
      </div>
    </Alert>
  );
}

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
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${VERDICT_STYLE[g.state]}`}>
          {g.title}: {g.verdict}
        </span>
      ))}
    </div>
  );
}

function parseOptions(body) {
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
}

function Options({ title, body }) {
  const items = useMemo(() => parseOptions(body), [body]);

  if (!items.length) {
    return (
      <article className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">{title}</h3>
        <Markdown className="text-[13px] text-text-2">{body}</Markdown>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <ol className="space-y-2">
        {items.map((o, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full
                             bg-muted text-[11px] font-medium text-foreground">
              {fa(i + 1)}
            </span>
            <div className="min-w-0 grow">
              {o.label && <p className="text-[13px] font-medium leading-relaxed">{o.label}</p>}
              <p className="text-[12px] leading-relaxed text-text-4 line-clamp-2">{o.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function Gate({ gate, sections, schools }) {
  const body = sections[`gate:${gate.key}`];
  if (!body) return null;

  const { verdict, rest } = splitVerdict(body);
  const state = verdictState(verdict);
  const feeders = (STAGE_SCHOOLS[gate.key] || []).filter(k => sections[`school:${k}`]);

  return (
    <AccordionItem value={gate.key}>
      <AccordionTrigger>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span>{gate.title}</span>
          {verdict && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${VERDICT_STYLE[state]}`}>
              {verdict}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {gate.sub && <p className="mb-2 text-[11px] text-text-5">{gate.sub}</p>}
        {rest && <Markdown className="text-[13px] text-text-2">{rest}</Markdown>}
        {Boolean(feeders.length) && <Lenses feeders={feeders} sections={sections} schools={schools} />}
      </AccordionContent>
    </AccordionItem>
  );
}

function Lenses({ feeders, sections, schools }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="flex min-h-11 items-center gap-1.5 text-[12px] font-medium text-foreground">
        {open ? 'بستن لنزها' : `دیدن ${fa(feeders.length)} لنز`}
        <ChevronDown className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                     aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-4 pt-1">
          {feeders.map(k => {
            const s = schools[k];
            const sec = splitVerdict(sections[`school:${k}`]);
            return (
              <div key={k} className="border-s-2 ps-4"
                   style={{ borderColor: s?.color || 'var(--color-border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: s?.color }}>
                    {s?.name || k}
                  </span>
                  {s?.thinker && <span className="text-[10px] text-text-5">{s.thinker}</span>}
                  {sec.verdict && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${VERDICT_STYLE[verdictState(sec.verdict)]}`}>
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
    </div>
  );
}

function Matrix({ raw, options }) {
  const rows = useMemo(() => parseMatrix(raw), [raw]);
  const cols = useMemo(() => scoredColumns(rows), [rows]);
  const labels = useMemo(() => parseOptions(options).map(o => o.label).filter(Boolean), [options]);
  if (!rows.length || !cols.length) return null;

  const { totals, best } = matrixTotals(rows);

  return (
    <section>
      {labels.length > 0 && (
        <p className="mb-3 text-[12px] leading-relaxed text-text-4">
          {labels.map((l, i) => `${fa(i + 1)}. ${l}`).join(' · ')}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-border">
              <th className="p-2.5 text-start font-medium">گزینه</th>
              {cols.map(c => (
                <th key={c.key} className="p-2 text-center font-medium whitespace-nowrap">{c.label}</th>
              ))}
              <th className="p-2 text-center font-medium">جمع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="p-2.5 font-medium">
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
                          className={`nums ltr inline-block w-7 rounded py-1 font-medium ${scoreStyle(r.scores[c.i])}`}>
                      {scoreLabel(r.scores[c.i])}
                    </span>
                  </td>
                ))}
                <td className="p-2 text-center">
                  <span dir="ltr" className="nums ltr font-medium">{fa(totals[i])}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-5">
        دو ستون نخست — کرامت و عدالت — وتوکننده‌اند.
      </p>
    </section>
  );
}
