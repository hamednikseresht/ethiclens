import { useState } from 'react';
import { api } from '@/lib/api';
import {
  useResource, useAction, Panel, TextField, Status, Skeleton, ConfirmButton, Pill
} from './ui';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { faDate } from '@/lib/fa';
import { Plus, ChevronDown } from 'lucide-react';

/**
 * The instruction sent to the model.
 *
 * Exactly one prompt is active, and the active one cannot be deleted — the
 * server enforces both. Editing here changes what every future analysis is
 * built from, so the textarea is deliberately large: a prompt reviewed
 * through a four-line window is a prompt nobody actually reads.
 */
export default function Prompts() {
  const { data, error, loading, reload } = useResource('/api/admin/prompts');
  const [adding, setAdding] = useState(false);

  if (error) return <Status error={error} />;
  if (loading || !data) return <Skeleton rows={3} />;

  return (
    <div className="space-y-3">
      <Panel title="دستور تحلیل"
             hint="فقط یکی می‌تواند فعال باشد. دستور فعال، مبنای هر تحلیل تازه است."
             action={
               <Button size="sm" variant="outline" onClick={() => setAdding(a => !a)}>
                 <Plus className="size-3.5" />{adding ? 'بستن' : 'تازه'}
               </Button>
             }>
        {adding && <AddPrompt factory={data.factoryDefault}
                              onDone={() => { setAdding(false); reload(); }} />}

        <div className="space-y-2">
          {data.items.map(p => (
            <PromptRow key={p.id} prompt={p} active={p.key === data.activeKey} onChanged={reload} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function AddPrompt({ factory, onDone }) {
  const [form, setForm] = useState({ key: '', label: '', content: factory || '' });
  const act = useAction(onDone);

  const submit = (e) => {
    e.preventDefault();
    act.run(() => api.post('/api/admin/prompts', form), 'ساخته شد.');
  };

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border border-border bg-subtle p-3">
      <TextField label="کلید" id="pr-key" dir="ltr" required value={form.key}
                 hint="یکتا و لاتین؛ در تنظیمات با همین شناخته می‌شود."
                 onChange={(e) => setForm(f => ({ ...f, key: e.target.value }))} />
      <TextField label="نام" id="pr-label" value={form.label}
                 onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} />

      <div className="mb-3">
        <Label htmlFor="pr-content">متن دستور</Label>
        <textarea id="pr-content" required value={form.content} rows={14}
                  onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-card p-3 font-mono text-[12px]
                             leading-relaxed focus-visible:outline-none focus-visible:ring-2
                             focus-visible:ring-ring" />
        <p className="mt-1 text-[11px] text-text-5">
          متن کارخانه‌ای از پیش پر شده است تا از صفر ننویسید.
        </p>
      </div>

      <Status msg={act.msg} error={act.error} className="mb-2" />
      <Button type="submit" size="sm" variant="primary" disabled={act.busy}>ساختن</Button>
    </form>
  );
}

function PromptRow({ prompt, active, onChanged }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(prompt.content);
  const [label, setLabel] = useState(prompt.label);
  const act = useAction(onChanged);

  const save = () => act.run(() => api.put(`/api/admin/prompts/${prompt.id}`, { label, content }));
  const activate = () => act.run(() => api.post(`/api/admin/prompts/${prompt.id}/activate`), 'فعال شد.');
  const remove = () => act.run(() => api.del(`/api/admin/prompts/${prompt.id}`), 'حذف شد.');

  const dirty = content !== prompt.content || label !== prompt.label;

  return (
    <div className={`rounded-lg border ${active ? 'border-primary' : 'border-border'}`}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="flex w-full items-center gap-2 p-3 text-start">
        <span className="grow">
          <span className="block text-[13px] font-bold">{prompt.label || prompt.key}</span>
          <span className="ltr mt-0.5 block text-[10.5px] text-text-5">{prompt.key}</span>
        </span>
        {active && <Pill tone="info">فعال</Pill>}
        <ChevronDown className={`size-4 shrink-0 text-text-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border p-3">
          <TextField label="نام" id={`pr-l-${prompt.id}`} value={label}
                     onChange={(e) => setLabel(e.target.value)} />

          <div className="mb-3">
            <Label htmlFor={`pr-c-${prompt.id}`}>متن دستور</Label>
            <textarea id={`pr-c-${prompt.id}`} value={content} rows={18}
                      onChange={(e) => setContent(e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-card p-3 font-mono text-[12px]
                                 leading-relaxed focus-visible:outline-none focus-visible:ring-2
                                 focus-visible:ring-ring" />
          </div>

          {prompt.updated_at && (
            <p className="mb-2 text-[11px] text-text-5">آخرین ویرایش: {faDate(prompt.updated_at)}</p>
          )}

          <Status msg={act.msg} error={act.error} className="mb-2" />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={save} disabled={act.busy || !dirty}>ذخیره</Button>
            {!active && (
              <>
                <Button size="sm" variant="outline" onClick={activate} disabled={act.busy}>فعال کن</Button>
                <ConfirmButton onConfirm={remove} busy={act.busy} className="text-destructive">حذف</ConfirmButton>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
