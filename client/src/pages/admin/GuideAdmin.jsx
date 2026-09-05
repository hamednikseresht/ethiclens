import { useState } from 'react';
import { api } from '@/lib/api';
import {
  useResource, useAction, Panel, TextField, SelectField, Toggle,
  Status, Skeleton, ConfirmButton, Pill
} from './ui';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fa } from '@/lib/fa';
import { Plus, ChevronDown, RotateCcw } from 'lucide-react';

/**
 * The encyclopedia's text.
 *
 * Sections seeded from the factory content can be restored one at a time, and
 * a section that differs from its factory text is marked — otherwise there is
 * no way to tell an intentional edit from something changed years ago and
 * forgotten.
 *
 * `extra` is edited as raw JSON. It holds a different shape per kind — a
 * lens has thinkers and concepts, a phase has bullet points — and a form
 * built for one shape would quietly drop the others.
 */
export default function GuideAdmin() {
  const { data, error, loading, reload } = useResource('/api/admin/guide');
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState('');

  if (error) return <Status error={error} />;
  if (loading || !data) return <Skeleton rows={4} />;

  const shown = kind ? (data.byKind[kind] || []) : data.items;

  return (
    <div className="space-y-3">
      <Panel title="محتوای دانشنامه"
             hint="متن اینجا همان چیزی است که در صفحه دانشنامه دیده می‌شود. ساختار صفحه ثابت است و با ویرایش متن نمی‌شکند."
             action={
               <Button size="sm" variant="outline" onClick={() => setAdding(a => !a)}>
                 <Plus className="size-3.5" />{adding ? 'بستن' : 'تازه'}
               </Button>
             }>
        {adding && <AddSection kinds={data.kinds} onDone={() => { setAdding(false); reload(); }} />}

        <div className="flex gap-1.5 overflow-x-auto pb-1
                        [-ms-overflow-style:none] [scrollbar-width:none]
                        [&::-webkit-scrollbar]:hidden">
          <Chip active={!kind} onClick={() => setKind('')}>همه <span className="nums">{fa(data.items.length)}</span></Chip>
          {data.kinds.map(k => (
            <Chip key={k.key} active={kind === k.key} onClick={() => setKind(k.key)}>
              {k.label} <span className="nums">{fa(data.counts[k.key] || 0)}</span>
            </Chip>
          ))}
        </div>
      </Panel>

      {shown.map(s => <SectionRow key={s.id} section={s} onChanged={reload} />)}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
              active ? 'border-primary bg-primary-soft text-primary'
                     : 'border-border bg-card text-text-4'}`}>
      {children}
    </button>
  );
}

function AddSection({ kinds, onDone }) {
  const [form, setForm] = useState({ kind: kinds[0]?.key || 'prose', key: '', title: '' });
  const act = useAction(onDone);

  return (
    <form onSubmit={(e) => { e.preventDefault(); act.run(() => api.post('/api/admin/guide', form), 'ساخته شد.'); }}
          className="mb-4 rounded-lg border border-border bg-subtle p-3">
      <SelectField label="نوع" id="g-kind" value={form.kind}
                   onChange={(e) => setForm(f => ({ ...f, kind: e.target.value }))}
                   options={kinds.map(k => ({ value: k.key, label: k.label }))} />
      <TextField label="کلید" id="g-key" dir="ltr" value={form.key}
                 hint="خالی بگذارید تا خودکار ساخته شود."
                 onChange={(e) => setForm(f => ({ ...f, key: e.target.value }))} />
      <TextField label="عنوان" id="g-title" required value={form.title}
                 onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
      <Status msg={act.msg} error={act.error} className="mb-2" />
      <Button type="submit" size="sm" variant="primary" disabled={act.busy}>ساختن</Button>
    </form>
  );
}

function SectionRow({ section, onChanged }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: section.title,
    subtitle: section.subtitle || '',
    lead: section.lead || '',
    body: section.body || '',
    extra: JSON.stringify(section.extra || {}, null, 2),
    sort_order: section.sort_order,
    enabled: !!section.enabled
  });
  const [jsonError, setJsonError] = useState('');
  const act = useAction(onChanged);

  const save = () => {
    // Parsed before sending: the server would store an unparseable string and
    // the page would then silently render the section without its extras.
    let extra;
    try { extra = JSON.parse(form.extra || '{}'); }
    catch { return setJsonError('JSON نامعتبر است.'); }
    setJsonError('');
    act.run(() => api.put(`/api/admin/guide/${section.id}`, { ...form, extra }));
  };

  const reset = () => act.run(() => api.post(`/api/admin/guide/${section.id}/reset`), 'به متن کارخانه برگشت.');
  const remove = () => act.run(() => api.del(`/api/admin/guide/${section.id}`), 'حذف شد.');

  return (
    <div className="rounded-xl border border-border bg-card">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="flex w-full items-center gap-2 p-3.5 text-start">
        <span className="grow overflow-hidden">
          <span className="block truncate text-[13px] font-bold">{section.title}</span>
          <span className="ltr mt-0.5 block truncate text-[10.5px] text-text-5">{section.key}</span>
        </span>
        {section.modified && <Pill tone="warn">ویرایش‌شده</Pill>}
        {!section.enabled && <Pill tone="danger">پنهان</Pill>}
        <ChevronDown className={`size-4 shrink-0 text-text-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border p-3.5">
          <TextField label="عنوان" id={`g-t-${section.id}`} value={form.title}
                     onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          <TextField label="زیرعنوان" id={`g-s-${section.id}`} value={form.subtitle}
                     hint="در لنزها نام لاتین، در فازها شماره فاز، در متن‌ها یک ایموجی."
                     onChange={(e) => setForm(f => ({ ...f, subtitle: e.target.value }))} />
          <TextField label="پرسش کلیدی" id={`g-l-${section.id}`} value={form.lead}
                     onChange={(e) => setForm(f => ({ ...f, lead: e.target.value }))} />

          <div className="mb-3">
            <Label htmlFor={`g-b-${section.id}`}>متن</Label>
            <textarea id={`g-b-${section.id}`} value={form.body} rows={8}
                      onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-input bg-card p-3 text-[13px]
                                 leading-loose focus-visible:outline-none focus-visible:ring-2
                                 focus-visible:ring-ring" />
          </div>

          <div className="mb-3">
            <Label htmlFor={`g-e-${section.id}`}>داده‌های تکمیلی (JSON)</Label>
            <textarea id={`g-e-${section.id}`} value={form.extra} rows={8} dir="ltr"
                      onChange={(e) => setForm(f => ({ ...f, extra: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-input bg-card p-3 font-mono
                                 text-[11.5px] leading-relaxed focus-visible:outline-none
                                 focus-visible:ring-2 focus-visible:ring-ring" />
            {jsonError && <p className="mt-1 text-[11px] text-destructive">{jsonError}</p>}
          </div>

          <TextField label="ترتیب" id={`g-o-${section.id}`} type="number" value={form.sort_order}
                     onChange={(e) => setForm(f => ({ ...f, sort_order: e.target.value }))} />

          <Toggle label="نمایش داده شود" checked={form.enabled}
                  onChange={(v) => setForm(f => ({ ...f, enabled: v }))} />

          <Status msg={act.msg} error={act.error} className="my-2" />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={save} disabled={act.busy}>ذخیره</Button>
            {section.modified && (
              <Button size="sm" variant="outline" onClick={reset} disabled={act.busy}>
                <RotateCcw className="size-3.5" />بازگشت به متن کارخانه
              </Button>
            )}
            <ConfirmButton onConfirm={remove} busy={act.busy} className="text-destructive">حذف</ConfirmButton>
          </div>
        </div>
      )}
    </div>
  );
}
