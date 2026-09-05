import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, TriangleAlert, Loader2 } from 'lucide-react';

/**
 * The pieces every admin section repeats.
 *
 * The panel is eleven sections deep and they all do the same four things:
 * fetch something, show a form, save it, and say what happened. Without a
 * shared set these turn into eleven slightly different spellings of the same
 * pattern, and the differences are always accidental.
 */

/* ==========================================================================
   Loading
   ========================================================================== */

/**
 * Fetch, hold, reload.
 *
 * `reload` is returned rather than exposed as an effect dependency so a
 * section can refresh after a mutation without re-running whatever else the
 * effect happened to close over.
 */
export function useResource(path, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try { setData(await api.get(path)); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [path, enabled]);

  useEffect(() => { reload(); }, [reload]);

  return { data, error, loading, reload, setData };
}

/** A saving action with its own busy flag and its own message. */
export function useAction(onDone) {
  const [state, setState] = useState({ busy: false, msg: '', error: '' });

  const run = useCallback(async (fn, successMessage = 'ذخیره شد.') => {
    setState({ busy: true, msg: '', error: '' });
    try {
      const r = await fn();
      setState({ busy: false, msg: successMessage, error: '' });
      await onDone?.(r);
      return r;
    } catch (e) {
      setState({ busy: false, msg: '', error: e.message });
      return null;
    }
  }, [onDone]);

  return { ...state, run, clear: () => setState({ busy: false, msg: '', error: '' }) };
}

/* ==========================================================================
   Layout
   ========================================================================== */

export function Panel({ title, hint, action, children }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      {(title || action) && (
        <div className="mb-3 flex items-start gap-3">
          <div className="grow">
            {title && <h2 className="text-sm font-bold">{title}</h2>}
            {hint && <p className="mt-1 text-justify text-[11.5px] leading-loose text-text-4">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, id, children }) {
  return (
    <div className="mb-3 last:mb-0">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-text-5">{hint}</p>}
    </div>
  );
}

export function TextField({ label, hint, id, ...props }) {
  return (
    <Field label={label} hint={hint} id={id}>
      <Input id={id} {...props} />
    </Field>
  );
}

export function SelectField({ label, hint, id, options, ...props }) {
  return (
    <Field label={label} hint={hint} id={id}>
      <select id={id} {...props}
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-base
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

/**
 * A labelled on/off row.
 *
 * A real checkbox underneath rather than a styled div: it is focusable, it
 * toggles with the keyboard, and screen readers already know what it is.
 */
export function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 py-2 ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={!!checked} disabled={disabled}
             onChange={(e) => onChange(e.target.checked)}
             className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]" />
      <span className="grow">
        <span className="block text-[13px] font-bold">{label}</span>
        {hint && <span className="mt-0.5 block text-justify text-[11px] leading-loose text-text-4">{hint}</span>}
      </span>
    </label>
  );
}

/* ==========================================================================
   Feedback
   ========================================================================== */

export function Status({ msg, error, className = '' }) {
  if (!msg && !error) return null;
  return error
    ? <p className={`flex items-start gap-1.5 text-[12px] text-destructive ${className}`}>
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{error}
      </p>
    : <p className={`flex items-center gap-1.5 text-[12px] text-ok ${className}`}>
        <Check className="size-3.5" />{msg}
      </p>;
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`size-4 animate-spin ${className}`} />;
}

export function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-card" />
      ))}
    </div>
  );
}

export function Empty({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-[12.5px] text-text-4">
      {children}
    </p>
  );
}

/**
 * Two-step confirmation, in place.
 *
 * A window.confirm is easy to dismiss without reading and impossible to
 * style; a modal for a row action is heavy. This turns the button into its
 * own question and keeps the answer next to the thing being answered about.
 */
export function ConfirmButton({ onConfirm, children, question = 'مطمئنید؟', busy, ...props }) {
  const [armed, setArmed] = useState(false);

  // Disarms on its own, so a half-pressed delete does not sit there waiting
  // to be completed by an unrelated tap later.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <Button size="sm" variant="ghost" disabled={busy}
              onClick={() => setArmed(true)} {...props}>
        {children}
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] text-text-4">{question}</span>
      <Button size="sm" variant="destructive" disabled={busy}
              onClick={() => { setArmed(false); onConfirm(); }}>
        بله
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>خیر</Button>
    </span>
  );
}

/**
 * A wide table that scrolls inside its own box.
 *
 * The negative margin lets it use the full page width on a phone while the
 * text around it stays inset — without it the table is squeezed into the
 * content column and every column ends up too narrow to read.
 */
export function TableWrap({ children }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-max min-w-full border-collapse text-[12px]">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }) {
  return (
    <th className={`whitespace-nowrap px-2.5 py-2 text-start text-[11px] font-bold text-text-4 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = '' }) {
  return <td className={`px-2.5 py-2.5 align-top ${className}`}>{children}</td>;
}

/** A small state chip. `tone` maps to the semantic pairs in the theme. */
export function Pill({ tone, children }) {
  const tones = {
    ok:     'border-ok/30 bg-ok-soft text-ok',
    warn:   'border-warn/30 bg-warn-soft text-warn',
    danger: 'border-destructive/30 bg-destructive-soft text-destructive',
    info:   'border-primary/30 bg-primary-soft text-primary'
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${
      tones[tone] || 'border-border bg-muted text-text-4'}`}>
      {children}
    </span>
  );
}
