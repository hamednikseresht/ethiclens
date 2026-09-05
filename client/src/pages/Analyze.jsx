import { useState, useEffect, useRef } from 'react';
import { api, streamAnalysis } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { quoteDeck } from '@shared/quotes.js';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { fa, faDuration } from '@/lib/fa';

/**
 * New analysis: a two-step form, then a waiting screen while the model works.
 *
 * The split comes from the mobile handoff — the dilemma alone on step one, the
 * six optional context fields on step two. It replaces a single long form with
 * an expander that most people never opened, which meant most analyses arrived
 * with no context at all.
 *
 * The waiting screen is deliberately not a live transcript. An analysis runs
 * for a minute or more and watching half-formed reasoning scroll past invites
 * reading conclusions the model has not reached yet. It shows progress through
 * the eight lenses instead, with something worth reading while you wait.
 */

const MIN_LEN = 20;
const MAX_LEN = 8000;

const CONTEXT_FIELDS = [
  { key: 'domain',       label: 'حوزه',                    placeholder: 'محیط کار، خانواده، سلامت…' },
  { key: 'stakeholders', label: 'چه کسانی درگیرند؟',        placeholder: 'خودم، همسرم، مدیر، مشتریان…', multiline: true },
  { key: 'options',      label: 'گزینه‌هایی که به آن‌ها فکر کرده‌اید', placeholder: '۱. قبول کنم ۲. رد کنم ۳. گزارش بدهم', multiline: true },
  { key: 'urgency',      label: 'فوریت',                   placeholder: 'همین امروز، چند روز، چند هفته…' },
  { key: 'values',       label: 'ارزش‌ها و محدودیت‌های شخصی', placeholder: 'صداقت برایم از امنیت شغلی مهم‌تر است، ولی…', multiline: true }
];

export default function Analyze({ onDone }) {
  const [meta, setMeta] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    dilemma: '', domain: '', stakeholders: '', options: '', urgency: '', values: '', model: ''
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/analyze/meta')
      .then(d => { setMeta(d); setForm(f => ({ ...f, model: d.defaultModel || d.models?.[0]?.ref || '' })); })
      .catch(e => setError(e.message));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const tooShort = form.dilemma.trim().length < MIN_LEN;

  if (running) {
    return <Waiting form={form} meta={meta} onDone={onDone}
                    onCancel={() => setRunning(false)}
                    onError={(m) => { setError(m); setRunning(false); }} />;
  }

  return (
    <div className="mx-auto max-w-xl px-5 pb-24 pt-6">
      <StepHeader step={step} />

      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="display text-[33px] font-semibold leading-tight">
              چه دوراهی‌ای پیش رویتان است؟
            </h1>
            <p className="text-sm leading-loose text-text-3">
              موقعیت را با جزئیات بنویسید. هرچه دقیق‌تر، تحلیل کمتر کلی‌گویانه.
            </p>
          </div>

          <div className="space-y-1.5">
            <textarea
              value={form.dilemma}
              onChange={(e) => set('dilemma', e.target.value.slice(0, MAX_LEN))}
              rows={9}
              autoFocus
              placeholder="مثلاً: مدیرم از من خواسته گزارشی را طوری بنویسم که ایراد یک محصول در آن دیده نشود. اگر قبول نکنم احتمالاً شغلم را از دست می‌دهم، و همسرم بیکار است…"
              className="w-full rounded-lg border border-input bg-card p-4 text-[15px] leading-loose
                         placeholder:text-text-5 focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            />
            <div className="flex justify-between text-[11px] text-text-5">
              <span>{tooShort ? `دست‌کم ${fa(MIN_LEN)} نویسه` : 'کافی است'}</span>
              <span className="nums">{fa(form.dilemma.length)} / {fa(MAX_LEN)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" disabled={tooShort} onClick={() => setStep(2)}>
              ادامه <ArrowLeft className="size-4" />
            </Button>
            <Button variant="outline" disabled={tooShort} onClick={() => setRunning(true)}>
              بدون جزئیات
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="display text-[30px] font-semibold leading-tight">اطلاعات تکمیلی</h2>
            <p className="text-sm leading-loose text-text-3">
              همه اختیاری‌اند. هرکدام را پر کنید، تحلیل همان‌قدر دقیق‌تر می‌شود.
            </p>
          </div>

          {CONTEXT_FIELDS.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              {f.multiline ? (
                <textarea
                  id={f.key} rows={2} value={form[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full rounded-md border border-input bg-card p-3 text-sm leading-loose
                             placeholder:text-text-5 focus-visible:outline-none focus-visible:ring-2
                             focus-visible:ring-ring"
                />
              ) : (
                <Input id={f.key} value={form[f.key]}
                       onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
              )}
            </div>
          ))}

          {meta?.models?.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="model">مدل تحلیل</Label>
              <select
                id="model" value={form.model} onChange={(e) => set('model', e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {meta.models.map(m => (
                  <option key={m.ref} value={m.ref}>{m.label} — {m.provider}</option>
                ))}
              </select>
              {meta.models.find(m => m.ref === form.model)?.note && (
                <p className="text-[11px] text-text-5">
                  {meta.models.find(m => m.ref === form.model).note}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowRight className="size-4" /> بازگشت
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setRunning(true)}>
              <Compass className="size-4" /> شروع تحلیل
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepHeader({ step }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      {[1, 2].map(n => (
        <span key={n}
              className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-primary' : 'bg-muted'}`} />
      ))}
      <span className="nums shrink-0 text-[11px] font-bold text-text-4">{fa(step)} / ۲</span>
    </div>
  );
}

/* ==========================================================================
   Waiting screen
   ========================================================================== */
function Waiting({ form, meta, onDone, onCancel, onError }) {
  const [progress, setProgress] = useState(0);
  const [seen, setSeen] = useState([]);
  const [quote, setQuote] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const deck = useRef(quoteDeck());
  const at = useRef(0);
  const controller = useRef(null);
  // Accumulated text is a ref, not state: it grows on every token and
  // re-rendering the page for each one would spend the whole wait in React.
  const acc = useRef('');

  useEffect(() => {
    setQuote(deck.current[0]);
    const rotate = setInterval(() => {
      at.current = (at.current + 1) % deck.current.length;
      setQuote(deck.current[at.current]);
    }, 9000);
    const tick = setInterval(() => setElapsed(e => e + 1), 1000);

    controller.current = new AbortController();

    streamAnalysis(
      {
        dilemma: form.dilemma.trim(),
        domain: form.domain, stakeholders: form.stakeholders,
        options: form.options, urgency: form.urgency, values: form.values,
        model: form.model || undefined
      },
      {
        signal: controller.current.signal,
        onDelta: (t) => {
          acc.current += t;
          // Progress is measured by how many of the 26 marked blocks have
          // opened — the only honest signal available mid-stream. A timer
          // would be a guess, and token count says nothing about structure.
          const marks = acc.current.match(/^\s*@@\s*[a-zA-Z:_-]+\s*@@\s*$/gm) || [];
          setProgress(Math.min(99, Math.round((marks.length / 26) * 100)));
          setSeen(marks.map(m => m.replace(/@|@|\s/g, '')).filter(k => k.startsWith('school:')));
        },
        onDone: (result) => onDone?.(result)
      }
    ).catch(err => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

    return () => {
      clearInterval(rotate);
      clearInterval(tick);
      controller.current?.abort();
    };
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-between px-5 pb-24 pt-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-text-3">در حال تحلیل</span>
            <span className="nums text-xs text-text-5">{faDuration(elapsed)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-700"
                 style={{ width: `${Math.max(4, progress)}%` }} />
          </div>
          <p className="text-[11px] text-text-5">
            {progress < 15 && 'مدل در حال خواندن موقعیت است…'}
            {progress >= 15 && progress < 60 && 'در حال سنجش از منظر مکاتب…'}
            {progress >= 60 && 'در حال جمع‌بندی و آزمون تصمیم…'}
          </p>
        </div>

        {meta?.schools && (
          <div className="flex flex-wrap gap-1.5">
            {meta.schools.map(s => {
              const done = seen.includes(`school:${s.key}`);
              return (
                <span key={s.key}
                      className="rounded-full border px-2.5 py-1 text-[10px] font-bold transition-opacity"
                      style={{
                        borderColor: done ? s.color : 'var(--color-border)',
                        color: done ? s.color : 'var(--color-text-5)',
                        opacity: done ? 1 : 0.55
                      }}>
                  {s.name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {quote && (
        <Card className="my-8 border-0 bg-transparent">
          <CardContent className="space-y-4 p-0 text-center">
            <blockquote className="display text-[26px] font-medium leading-relaxed text-foreground">
              {quote.text}
            </blockquote>
            <cite className="block text-xs not-italic text-text-4">
              <span className="font-bold">{quote.who}</span>
              <span className="mt-0.5 block text-[11px] text-text-5">{quote.work}</span>
            </cite>
          </CardContent>
        </Card>
      )}

      <Button variant="ghost" className="mx-auto text-text-4" onClick={() => { controller.current?.abort(); onCancel?.(); }}>
        <X className="size-4" /> لغو تحلیل
      </Button>
    </div>
  );
}
