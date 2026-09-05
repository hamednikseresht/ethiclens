import { useState } from 'react';
import { api } from '@/lib/api';
import {
  useResource, useAction, Panel, TextField, Status, Skeleton, Empty, ConfirmButton, Pill
} from './ui';
import { Button } from '@/components/ui/button';
import { fa } from '@/lib/fa';
import { Plus, ChevronDown } from 'lucide-react';

/**
 * Categories for published analyses.
 *
 * The Persian title and the ASCII slug are separate fields on purpose: the
 * slug sits in the path of every article beneath it, and a Persian segment
 * there survives copying badly once something percent-encodes it.
 */
export default function Categories() {
  const { data, error, loading, reload } = useResource('/api/admin/categories');
  const [adding, setAdding] = useState(false);

  if (error) return <Status error={error} />;
  if (loading || !data) return <Skeleton rows={3} />;

  return (
    <Panel title="دسته‌بندی محتوای منتشرشده"
           hint="نشانی دسته با حروف لاتین ساخته می‌شود؛ عنوان فارسی چیزی است که خواننده می‌بیند."
           action={
             <Button size="sm" variant="outline" onClick={() => setAdding(a => !a)}>
               <Plus className="size-3.5" />{adding ? 'بستن' : 'تازه'}
             </Button>
           }>
      {adding && <AddCategory onDone={() => { setAdding(false); reload(); }} />}

      {!data.items.length ? (
        <Empty>هنوز دسته‌بندی‌ای ساخته نشده است.</Empty>
      ) : (
        <div className="space-y-2">
          {data.items.map(c => <CategoryRow key={c.id} cat={c} onChanged={reload} />)}
        </div>
      )}
    </Panel>
  );
}

function AddCategory({ onDone }) {
  const [form, setForm] = useState({ title: '', slug: '', description: '' });
  const act = useAction(onDone);

  return (
    <form onSubmit={(e) => { e.preventDefault(); act.run(() => api.post('/api/admin/categories', form), 'ساخته شد.'); }}
          className="mb-4 rounded-lg border border-border bg-subtle p-3">
      <TextField label="عنوان فارسی" id="c-title" required value={form.title}
                 onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
      <TextField label="نشانی لاتین" id="c-slug" dir="ltr" required value={form.slug}
                 hint="مثل workplace — در آدرس صفحه دسته می‌آید."
                 onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))} />
      <TextField label="توضیح" id="c-desc" value={form.description}
                 onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
      <Status msg={act.msg} error={act.error} className="mb-2" />
      <Button type="submit" size="sm" variant="primary" disabled={act.busy}>ساختن</Button>
    </form>
  );
}

function CategoryRow({ cat, onChanged }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: cat.title, slug: cat.slug,
    description: cat.description || '', sort_order: cat.sort_order
  });
  const [force, setForce] = useState(null);
  const act = useAction(onChanged);

  const save = () => act.run(() => api.put(`/api/admin/categories/${cat.id}`, form));

  const remove = (confirmed) => act.run(async () => {
    try {
      return await api.del(`/api/admin/categories/${cat.id}${confirmed ? '?force=1' : ''}`);
    } catch (e) {
      if (e.body?.needsForce) { setForce(e.body); return null; }
      throw e;
    }
  }, 'حذف شد.');

  return (
    <div className="rounded-lg border border-border">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="flex w-full items-center gap-2 p-3 text-start">
        <span className="grow">
          <span className="block text-[13px] font-bold">{cat.title}</span>
          <span className="ltr mt-0.5 block text-[10.5px] text-text-5">/category/{cat.slug}</span>
        </span>
        {cat.published > 0 && <Pill tone="info">{fa(cat.published)} منتشرشده</Pill>}
        <ChevronDown className={`size-4 shrink-0 text-text-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border p-3">
          <TextField label="عنوان فارسی" id={`c-t-${cat.id}`} value={form.title}
                     onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          <TextField label="نشانی لاتین" id={`c-s-${cat.id}`} dir="ltr" value={form.slug}
                     hint="عوض کردن این، نشانی صفحه دسته را تغییر می‌دهد و لینک‌های قبلی می‌شکنند."
                     onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))} />
          <TextField label="توضیح" id={`c-d-${cat.id}`} value={form.description}
                     onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
          <TextField label="ترتیب" id={`c-o-${cat.id}`} type="number" value={form.sort_order}
                     onChange={(e) => setForm(f => ({ ...f, sort_order: e.target.value }))} />

          <Status msg={act.msg} error={act.error} className="my-2" />

          {force && (
            <div className="my-2 rounded-lg border border-warn/30 bg-warn-soft p-2.5">
              <p className="mb-2 text-justify text-[12px] leading-loose text-warn">{force.error}</p>
              <Button size="sm" variant="destructive"
                      onClick={() => { setForce(null); remove(true); }}>
                بله، حذف کن
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={save} disabled={act.busy}>ذخیره</Button>
            <ConfirmButton onConfirm={() => remove(false)} busy={act.busy}
                           className="text-destructive">حذف</ConfirmButton>
          </div>
        </div>
      )}
    </div>
  );
}
