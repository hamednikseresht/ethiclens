import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { fa } from '@/lib/fa';
import { ChevronDown, Info, ArrowLeft } from 'lucide-react';

/**
 * The encyclopedia.
 *
 * Structure is fixed here and only the text comes from the API, so an admin
 * editing a section cannot break the layout.
 *
 * The old page rendered everything expanded: eight lenses with their concepts,
 * critiques and sources came to roughly four thousand pixels of scroll before
 * the gates even started. That reads acceptably on a desktop with a table of
 * contents in view, and badly on a phone, where the dominant use is looking
 * one thing up — what the justice gate asks, what genealogy is for. So the
 * lenses collapse to their name and their central question, the section chips
 * stay pinned under the header, and expanding is one tap.
 *
 * It stays a single document rather than tabbed views: a reference people
 * search within, deep-link into, and occasionally read end to end.
 */

// The app header is 56px and this page's chip bar sits directly beneath it.
// Both numbers are needed twice — once to pin the bar, once as the scroll
// margin that keeps an anchored heading from landing behind it — so they are
// named once here instead of being written out four times.
const HEADER = 56;
const CHIPS = 45;
const belowHeader = `calc(${HEADER}px + env(safe-area-inset-top, 0px))`;
const belowChips = `calc(${HEADER + CHIPS + 10}px + env(safe-area-inset-top, 0px))`;

export default function Guide() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openLenses, setOpenLenses] = useState(() => new Set());
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/guide').then(setData).catch(e => setError(e.message));
  }, []);

  const P = data?.prose || {};

  const sections = useMemo(() => data ? [
    P.framework   && { id: 'framework',    label: 'فرایند' },
    P.lenses      && { id: 'lenses',       label: 'لنزها' },
    P.gates       && { id: 'gates',        label: 'دروازه‌ها' },
                     { id: 'compare',      label: 'مقایسه' },
    P.experiments && { id: 'experiments',  label: 'آزمایش‌ها' },
    P.bibliography && { id: 'bibliography', label: 'منابع' }
  ].filter(Boolean) : [], [data]);

  const active = useActiveSection(sections.map(s => s.id));

  // A link like /guide#lens-justice should arrive with that lens already
  // open — that is how someone follows a reference out of a result.
  useEffect(() => {
    if (!data) return;
    const hash = decodeURIComponent(location.hash.replace('#', ''));
    if (!hash) return;
    if (hash.startsWith('lens-')) setOpenLenses(new Set([hash.slice(5)]));
    // The scroll waits a frame: at this point the sections have been asked
    // for but not laid out, and measuring an empty page lands at the top.
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
  }, [data]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-5 py-10">
        <p className="rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  if (!data) return <Skeleton />;

  const toggleLens = (key) => setOpenLenses(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const allOpen = openLenses.size === data.lenses.length;

  return (
    <div className="pb-6">
      {/* ---------------- Hero ---------------- */}
      <header className="mx-auto max-w-xl px-5 pt-7">
        {P.hero?.subtitle && (
          <span className="mb-2.5 inline-block rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold text-primary">
            {P.hero.subtitle}
          </span>
        )}
        <h1 className="display mb-3 text-[32px] font-semibold leading-tight">
          {P.hero?.title || 'دانشنامه'}
        </h1>
        <Markdown className="text-[13px] leading-loose text-text-3">{P.hero?.body}</Markdown>
      </header>

      {/* ---------------- Section chips ---------------- */}
      <nav className="sticky z-10 mt-5 border-y border-border bg-background/95 backdrop-blur"
           style={{ top: belowHeader }}>
        <div className="mx-auto flex max-w-xl gap-1.5 overflow-x-auto px-5 py-2
                        [-ms-overflow-style:none] [scrollbar-width:none]
                        [&::-webkit-scrollbar]:hidden">
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`}
               onClick={(e) => {
                 // Handled here rather than left to the browser so the URL
                 // does not collect a hash for every chip the reader taps.
                 e.preventDefault();
                 document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
               }}
               className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                 active === s.id
                   ? 'border-primary bg-primary-soft text-primary'
                   : 'border-border bg-card text-text-4'}`}>
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-xl px-5">
        {/* ---------------- Five phases ---------------- */}
        <Section prose={P.framework}>
          <div className="space-y-3">
            {data.phases.map(p => <PhaseCard key={p.id} phase={p} />)}
          </div>
          <Note prose={P['method-note']} />
        </Section>

        {/* ---------------- Eight lenses ---------------- */}
        <Section prose={P.lenses}
                 action={
                   <button onClick={() => setOpenLenses(allOpen ? new Set()
                                                                : new Set(data.lenses.map(lensKey)))}
                           className="shrink-0 text-[11px] font-bold text-primary">
                     {allOpen ? 'بستن همه' : 'باز کردن همه'}
                   </button>
                 }>
          <div className="space-y-2.5">
            {data.lenses.map(l => (
              <LensCard key={l.id} lens={l}
                        open={openLenses.has(lensKey(l))}
                        onToggle={() => toggleLens(lensKey(l))} />
            ))}
          </div>
        </Section>

        {/* ---------------- Five gates ---------------- */}
        <Section prose={P.gates}>
          <ol className="space-y-0">
            {data.gates.map((g, i) => (
              <GateStep key={g.id} gate={g} last={i === data.gates.length - 1} />
            ))}
          </ol>
          <Note prose={P['gates-why']} />
        </Section>

        {/* ---------------- Comparison ---------------- */}
        <Compare lenses={data.lenses} />

        {/* ---------------- Thought experiments ---------------- */}
        <Section prose={P.experiments}>
          <div className="space-y-2.5">
            {data.experiments.map(e => <ExperimentCard key={e.id} exp={e} />)}
          </div>
        </Section>

        {/* ---------------- Call to action ---------------- */}
        <section className="mt-9 rounded-2xl bg-ink p-6 text-center">
          <h2 className="display mb-2 text-[24px] font-semibold leading-snug text-white">
            حالا این لنزها را روی موقعیت خودتان بگذارید
          </h2>
          <p className="mb-5 text-[13px] leading-loose text-white/70">
            دیدگاه اخلاق دوراهی شما را از هر {fa(data.lenses.length)} منظر می‌سنجد،
            از {fa(data.gates.length)} دروازه می‌گذراند و تعارض‌ها را نشان می‌دهد —
            نه اینکه به‌جای شما تصمیم بگیرد.
          </p>
          <Button variant="primary" onClick={() => navigate('/')} className="w-full">
            شروع تحلیل
            <ArrowLeft className="size-4" />
          </Button>
        </section>

        {/* ---------------- Bibliography and method ---------------- */}
        <Section prose={P.bibliography} />
        <Section prose={P.method} />
      </div>
    </div>
  );
}

/* ==========================================================================
   Section scaffolding
   ========================================================================== */

/**
 * A prose heading plus whatever the section contains.
 *
 * The anchor id lives on the heading and comes from the section key with its
 * `intro:` prefix dropped, which is what the chip bar and any inbound deep
 * link expect.
 */
function Section({ prose, children, action }) {
  if (!prose && !children) return null;
  const id = prose ? prose.key.replace(/^intro:/, '') : undefined;

  return (
    <section className="mt-9">
      {prose && (
        <div id={id} style={{ scrollMarginTop: belowChips }}>
          <div className="mb-2 flex items-end gap-3">
            <h2 className="display grow text-[26px] font-semibold leading-tight">
              {prose.subtitle && <span className="me-1.5">{prose.subtitle}</span>}
              {prose.title}
            </h2>
            {action}
          </div>
          <Markdown className="mb-4 text-[13px] leading-loose text-text-3">{prose.body}</Markdown>
        </div>
      )}
      {children}
    </section>
  );
}

/** A prose section an admin marked as an aside rather than a heading. */
function Note({ prose }) {
  if (!prose) return null;
  return (
    <div className="mt-4 rounded-xl border border-border bg-subtle p-4">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-text-4" />
        <div>
          <h3 className="mb-1 text-[13px] font-bold">{prose.title}</h3>
          <Markdown className="text-[13px] leading-loose text-text-3">{prose.body}</Markdown>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Content cards
   ========================================================================== */

function PhaseCard({ phase }) {
  const points = phase.extra?.points || [];
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-1.5 text-sm font-bold">
        {phase.subtitle && <span className="text-primary">{phase.subtitle}</span>}
        {phase.subtitle && ' · '}
        {phase.title}
      </h3>
      <Markdown className="text-[13px] text-text-3">{phase.body}</Markdown>
      {points.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {points.map((t, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-text-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-text-5" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * One lens, collapsed to the two things that identify it: its name and the
 * question it asks. Everything else — the argument, the key terms, the blind
 * spot, the sources — is a tap away.
 *
 * The school colour arrives as a hex string from the database, so it cannot
 * be a utility class. It is set as a custom property on the card and used for
 * the edge stripe and the icon well.
 */
function LensCard({ lens, open, onToggle }) {
  const x = lens.extra || {};
  const color = x.color || 'var(--color-primary)';
  const concepts = x.concepts || [];

  return (
    <article id={`lens-${lensKey(lens)}`}
             style={{ scrollMarginTop: belowChips, borderInlineStartColor: color }}
             className="overflow-hidden rounded-xl border border-s-[3px] border-border bg-card">
      <button onClick={onToggle} aria-expanded={open}
              className="flex w-full items-start gap-3 p-4 text-start">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg text-base"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}>
          {x.icon || '🔍'}
        </span>

        <span className="grow">
          <span className="block text-sm font-bold leading-snug">{lens.title}</span>
          {lens.subtitle && (
            <span className="ltr mt-0.5 block text-[11px] text-text-5">{lens.subtitle}</span>
          )}
          {lens.lead && (
            <span className="mt-1.5 block text-[12.5px] leading-relaxed" style={{ color }}>
              «{lens.lead}»
            </span>
          )}
        </span>

        <ChevronDown className={`mt-1 size-4 shrink-0 text-text-4 transition-transform ${
          open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3.5">
          <Markdown className="text-[13px] text-text-2">{lens.body}</Markdown>

          {x.thinkers && (
            <p className="mt-3 text-[11px] text-text-4">
              <span className="font-bold text-text-3">چهره‌های شاخص: </span>{x.thinkers}
            </p>
          )}

          {concepts.length > 0 && (
            <>
              <h4 className="mb-2 mt-4 text-[10px] font-bold tracking-wide text-text-5">مفاهیم کلیدی</h4>
              <dl className="space-y-2">
                {concepts.map((c, i) => (
                  <div key={i} className="rounded-lg bg-subtle p-3">
                    <dt className="mb-0.5 text-[12.5px] font-bold">
                      {c.name}
                      {c.term && <span className="ltr ms-1.5 text-[10.5px] font-normal text-text-5">{c.term}</span>}
                    </dt>
                    <dd className="text-justify text-[12.5px] leading-relaxed text-text-3">{c.desc}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {x.critique && (
            <div className="mt-4 rounded-lg border border-warn/25 bg-warn-soft p-3">
              <h4 className="mb-1 text-[11px] font-bold text-warn">نقطه کور</h4>
              <Markdown className="text-[12.5px] leading-relaxed text-text-2">{x.critique}</Markdown>
            </div>
          )}

          {x.sources && (
            <>
              <h4 className="mb-1.5 mt-4 text-[10px] font-bold tracking-wide text-text-5">منابع اصلی</h4>
              <Markdown className="text-[12px] leading-relaxed text-text-4">{x.sources}</Markdown>
            </>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * One gate in the sequence. The connector between steps is what makes it read
 * as an order rather than a list — the whole point of the gates is that they
 * run in this sequence and the first two can veto.
 */
function GateStep({ gate, last }) {
  const x = gate.extra || {};
  const color = x.color || 'var(--color-primary)';

  return (
    <li className="flex gap-3">
      <div className="flex shrink-0 flex-col items-center">
        <span className="grid size-8 place-items-center rounded-full text-[12px] font-bold text-white"
              style={{ backgroundColor: color }}>
          {x.n}
        </span>
        {!last && <span className="my-1 w-px grow bg-border" />}
      </div>

      <div className={last ? 'pb-0' : 'pb-5'}>
        <h3 className="mb-0.5 text-sm font-bold">
          {gate.title}
          {gate.lead && (
            <span className="ms-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
              {gate.lead}
            </span>
          )}
        </h3>
        {gate.subtitle && <p className="mb-1.5 text-[11px] text-text-5">{gate.subtitle}</p>}
        <Markdown className="text-[13px] text-text-3">{gate.body}</Markdown>
      </div>
    </li>
  );
}

function ExperimentCard({ exp }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-1.5 text-sm font-bold">{exp.title}</h3>
      <Markdown className="text-[13px] text-text-3">{exp.body}</Markdown>
      {exp.extra?.ref && (
        // The citation is entirely Latin. Left to inherit the page direction
        // it comes out with its page numbers and commas rearranged, so it is
        // given its own.
        <div dir="ltr" className="mt-2.5 border-t border-border pt-2 text-[11px] text-text-5">
          <Markdown>{exp.extra.ref}</Markdown>
        </div>
      )}
    </article>
  );
}

/**
 * The lenses side by side.
 *
 * Four columns will not fit a phone and compressing them to fit would defeat
 * the comparison, so the table keeps its width and scrolls inside its own
 * box — the page itself must never scroll sideways.
 */
function Compare({ lenses }) {
  return (
    <section className="mt-9">
      <div id="compare" style={{ scrollMarginTop: belowChips }}>
        <h2 className="display mb-2 text-[26px] font-semibold leading-tight">
          <span className="me-1.5">📊</span>جدول تطبیقی
        </h2>
        <p className="mb-4 text-[13px] leading-loose text-text-3">
          مقایسه سریع لنزها بر اساس پرسش بنیادین و مهم‌ترین نقد.
        </p>
      </div>

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-max min-w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border-strong text-start">
              {['لنز', 'پرسش بنیادین', 'چهره‌های شاخص', 'نقد اصلی'].map(h => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-start text-[11px] font-bold text-text-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lenses.map(l => (
              <tr key={l.id} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2.5 font-bold" style={{ color: l.extra?.color }}>
                  {l.title.replace(/^[۰-۹\d]+\.\s*/, '')}
                </td>
                <td className="min-w-[190px] px-3 py-2.5 leading-relaxed text-text-2">{l.lead}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-text-3">{l.extra?.thinkers}</td>
                <td className="min-w-[170px] px-3 py-2.5 leading-relaxed text-text-3">
                  {firstClause(l.extra?.critique)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ==========================================================================
   Helpers
   ========================================================================== */

/** `lens:virtue` → `virtue`, which is what the anchor ids are built from. */
function lensKey(lens) {
  return lens.key.split(':')[1] || String(lens.id);
}

/**
 * The opening clause of a critique, for the table cell. The full text is a
 * paragraph and a table row cannot carry one; the first clause is reliably
 * the claim itself, with the elaboration after it.
 */
function firstClause(text) {
  if (!text) return '';
  const clean = String(text).replace(/\*/g, '').trim();
  const cut = clean.split(/[.،؛]/)[0].trim();
  return cut.length > 60 ? cut.slice(0, 60) + '…' : cut;
}

/**
 * Which section the reader is currently in.
 *
 * The bottom margin is large on purpose: a section counts as active once its
 * heading reaches the area just under the chip bar, not when it happens to be
 * anywhere on screen — otherwise the last short section can never win against
 * the tall one above it.
 */
function useActiveSection(ids) {
  const [active, setActive] = useState('');
  const key = ids.join('|');

  useEffect(() => {
    if (!ids.length) return;
    const seen = new Map();

    const io = new IntersectionObserver(entries => {
      for (const e of entries) seen.set(e.target.id, e);
      const visible = [...seen.values()]
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: `-${HEADER + CHIPS + 4}px 0px -65% 0px` });

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key]);

  return active;
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-5 pt-7">
      <div className="h-9 w-2/3 animate-pulse rounded-lg bg-muted" />
      <div className="h-20 animate-pulse rounded-lg bg-muted" />
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
      ))}
    </div>
  );
}
