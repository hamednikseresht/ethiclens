import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { fa, faDate } from '@/lib/fa';
import {
  Star, Pencil, Download, Globe, Check, TriangleAlert, ExternalLink, NotebookPen
} from 'lucide-react';

/**
 * What you can do with a finished analysis.
 *
 * All of these mutate the row the result page is rendering, so each one
 * reports its change upward rather than refetching: the parent holds the
 * analysis and merges the patch, which keeps the star, the published badge
 * and the reflection in step without a round trip that re-renders the whole
 * twenty-six-section document.
 */

/* ==========================================================================
   The bar
   ========================================================================== */

export function AnalysisActions({ analysis, onUpdated }) {
  const [sheet, setSheet] = useState(null);        // null | 'rename' | 'publish'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggleFavorite = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post(`/api/history/${analysis.id}/favorite`);
      onUpdated({ is_favorite: r.isFavorite ? 1 : 0 });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const published = Boolean(analysis.is_public);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <IconAction onClick={toggleFavorite} disabled={busy}
                    active={Boolean(analysis.is_favorite)}
                    label={analysis.is_favorite ? 'برداشتن نشان' : 'نشان کردن'}>
          <Star className={`size-3.5 ${analysis.is_favorite ? 'fill-warn text-warn' : ''}`} />
          نشان
        </IconAction>

        <IconAction onClick={() => setSheet('rename')} label="تغییر عنوان">
          <Pencil className="size-3.5" />
          عنوان
        </IconAction>

        {/* A real link, not a fetch: the response is an attachment and the
            browser's own download handling is what saves it. GET is exempt
            from the CSRF check, so the session cookie is all it needs. */}
        <a href={`/api/history/${analysis.id}/export`} download
           className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card
                      px-3 text-[11px] font-bold text-text-3 transition-colors hover:bg-muted">
          <Download className="size-3.5" />
          خروجی
        </a>

        <IconAction onClick={() => setSheet('publish')} active={published}
                    label={published ? 'مدیریت انتشار' : 'انتشار عمومی'}>
          <Globe className="size-3.5" />
          {published ? 'منتشرشده' : 'انتشار'}
        </IconAction>
      </div>

      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}

      {published && analysis.slug && (
        <a href={`/analysis/${analysis.category_slug || 'public'}/${encodeURIComponent(analysis.slug)}`}
           className="mt-2 flex items-center gap-1.5 text-[11px] text-primary">
          <ExternalLink className="size-3" />
          دیدن صفحه عمومی
        </a>
      )}

      {sheet === 'rename' && (
        <RenameSheet analysis={analysis} onClose={() => setSheet(null)} onUpdated={onUpdated} />
      )}
      {sheet === 'publish' && (
        <PublishSheet analysis={analysis} onClose={() => setSheet(null)} onUpdated={onUpdated} />
      )}
    </>
  );
}

function IconAction({ children, onClick, disabled, active, label }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px]
                        font-bold transition-colors disabled:opacity-50 ${
              active ? 'border-primary bg-primary-soft text-primary'
                     : 'border-border bg-card text-text-3 hover:bg-muted'}`}>
      {children}
    </button>
  );
}

/* ==========================================================================
   Rename
   ========================================================================== */

function RenameSheet({ analysis, onClose, onUpdated }) {
  const [title, setTitle] = useState(analysis.title || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post(`/api/history/${analysis.id}/title`, { title: title.trim() });
      onUpdated({ title: r.title });
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Sheet title="تغییر عنوان" onClose={onClose}>
      <form onSubmit={save}>
        <Label htmlFor="ra-title">عنوان</Label>
        <Input id="ra-title" value={title} maxLength={120} required autoFocus
               onChange={(e) => setTitle(e.target.value)} />
        <p className="mt-1 text-[11px] text-text-5">
          این عنوان فقط در تاریخچه خودتان دیده می‌شود. عنوان صفحه عمومی جداست.
        </p>
        {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
        <Button type="submit" variant="primary" className="mt-4 w-full"
                disabled={busy || !title.trim()}>
          {busy ? 'در حال ذخیره…' : 'ذخیره'}
        </Button>
      </form>
    </Sheet>
  );
}

/* ==========================================================================
   Publish
   ========================================================================== */

/**
 * Publishing is always explicit and never automatic — a dilemma is personal
 * and often carries identifying detail. The form therefore shows exactly what
 * will become public: a separate title, a summary, and a name the author can
 * leave blank to stay anonymous.
 *
 * The editorial fields — slug, SEO title, H1, category, tags — appear only
 * when the server sent a category list, which it does only for admins. That
 * is the same rule the server enforces, mirrored so an ordinary user is not
 * shown fields their request would silently drop.
 */
function PublishSheet({ analysis, onClose, onUpdated }) {
  const isAdmin = Array.isArray(analysis.categories);
  const [form, setForm] = useState({
    public_title: analysis.public_title || analysis.title || '',
    public_summary: analysis.public_summary || '',
    public_author: analysis.public_author || '',
    slug: analysis.slug || '',
    seo_title: analysis.seo_title || '',
    h1: analysis.h1 || '',
    tags: (analysis.tags || []).join('، '),
    category_id: analysis.category_id || ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [titleTaken, setTitleTaken] = useState(false);

  const published = Boolean(analysis.is_public);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const publish = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setTitleTaken(false);
    try {
      const body = {
        public_title: form.public_title,
        public_summary: form.public_summary,
        public_author: form.public_author,
        ...(isAdmin ? {
          slug: form.slug,
          seo_title: form.seo_title,
          h1: form.h1,
          tags: form.tags,
          category_id: form.category_id || null
        } : {})
      };
      const r = await api.post(`/api/history/${analysis.id}/publish`, body);
      onUpdated({
        is_public: 1, slug: r.slug, published_at: r.published_at,
        public_title: r.public_title, public_summary: r.public_summary,
        public_author: r.public_author, category_id: r.category_id,
        seo_title: r.seo_title, h1: r.h1, tags: r.tags
      });
      onClose();
    } catch (err) {
      // The server refuses a duplicate public title rather than silently
      // suffixing the slug, so the author is told to pick a name they meant.
      if (err.body?.code === 'title_taken') setTitleTaken(true);
      setError(err.message);
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true); setError('');
    try {
      await api.post(`/api/history/${analysis.id}/publish`, { publish: false });
      onUpdated({ is_public: 0 });
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Sheet title={published ? 'مدیریت انتشار' : 'انتشار عمومی'} onClose={onClose}>
      <p className="mb-4 text-justify text-[12.5px] leading-loose text-text-3">
        متن دوراهی شما همان‌طور که نوشته‌اید روی صفحه عمومی دیده می‌شود. اگر جزئیات
        شناسایی‌کننده دارد، پیش از انتشار عنوان و خلاصه را طوری بنویسید که خودتان
        راضی باشید.
      </p>

      <form onSubmit={publish}>
        <div className="mb-3">
          <Label htmlFor="pb-title">عنوان عمومی</Label>
          <Input id="pb-title" value={form.public_title} maxLength={120} required
                 onChange={set('public_title')}
                 className={titleTaken ? 'border-destructive' : ''} />
        </div>

        <div className="mb-3">
          <Label htmlFor="pb-sum">خلاصه عمومی</Label>
          <textarea id="pb-sum" rows={3} maxLength={300} value={form.public_summary}
                    onChange={set('public_summary')}
                    placeholder="اگر خالی بگذارید، از بازخوانی مسئله ساخته می‌شود."
                    className="mt-1 w-full rounded-md border border-input bg-card p-3 text-[13px]
                               leading-loose focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-ring" />
        </div>

        <div className="mb-3">
          <Label htmlFor="pb-author">نام نویسنده</Label>
          <Input id="pb-author" value={form.public_author} maxLength={60}
                 onChange={set('public_author')}
                 placeholder="خالی بگذارید تا ناشناس منتشر شود" />
        </div>

        {isAdmin && (
          <fieldset className="mb-3 rounded-lg border border-border bg-subtle p-3">
            <legend className="px-1 text-[10px] font-bold tracking-wide text-text-5">
              تنظیمات سردبیری
            </legend>

            <div className="mb-3">
              <Label htmlFor="pb-cat">دسته‌بندی</Label>
              <select id="pb-cat" value={form.category_id} onChange={set('category_id')}
                      className="h-11 w-full rounded-md border border-input bg-card px-3 text-base
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">— بدون دسته‌بندی —</option>
                {analysis.categories.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <Label htmlFor="pb-slug">نشانی صفحه</Label>
              <Input id="pb-slug" dir="ltr" value={form.slug} maxLength={70}
                     onChange={set('slug')} disabled={Boolean(analysis.slug)}
                     placeholder="اگر خالی بماند از عنوان ساخته می‌شود" />
              <p className="mt-1 text-[11px] text-text-5">
                {analysis.slug
                  ? 'نشانی یک‌بار ساخته می‌شود و بعد ثابت می‌ماند تا لینک‌های منتشرشده نشکنند.'
                  : 'فقط همین یک بار قابل تعیین است.'}
              </p>
            </div>

            <div className="mb-3">
              <Label htmlFor="pb-seo">عنوان سئو</Label>
              <Input id="pb-seo" value={form.seo_title} maxLength={70} onChange={set('seo_title')}
                     placeholder="عنوانی که در نتیجه گوگل دیده می‌شود" />
            </div>

            <div className="mb-3">
              <Label htmlFor="pb-h1">تیتر صفحه</Label>
              <Input id="pb-h1" value={form.h1} maxLength={120} onChange={set('h1')} />
            </div>

            <div>
              <Label htmlFor="pb-tags">تگ‌ها</Label>
              <Input id="pb-tags" value={form.tags} onChange={set('tags')}
                     placeholder="اخلاق کار، صداقت، تعارض منافع" />
              <p className="mt-1 text-[11px] text-text-5">با ویرگول جدا کنید.</p>
            </div>
          </fieldset>
        )}

        {error && (
          <p className="mb-3 flex items-start gap-1.5 text-[12px] text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'در حال انتشار…' : published ? 'ذخیره تغییرات' : 'منتشر کن'}
        </Button>

        {published && (
          <Button type="button" variant="outline" className="mt-2 w-full" disabled={busy}
                  onClick={unpublish}>
            برداشتن از حالت عمومی
          </Button>
        )}
      </form>
    </Sheet>
  );
}

/* ==========================================================================
   Reflection — phase five
   ========================================================================== */

/**
 * What you actually decided, and what happened.
 *
 * This is the one part of the framework no model can supply, and the only
 * part that turns a reading into learning. It is also the part everyone
 * skips, so it is a filled block asking a question rather than a link to a
 * form somewhere else.
 *
 * Clearing both fields deletes the reflection — the server treats two empty
 * strings as "never mind", which is the honest way to undo a record of a
 * decision you did not end up making.
 */
export function Reflection({ analysis, onUpdated }) {
  const recorded = Boolean(analysis.reflected_at);
  const [editing, setEditing] = useState(!recorded);
  const [decision, setDecision] = useState(analysis.decision || '');
  const [text, setText] = useState(analysis.reflection || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post(`/api/history/${analysis.id}/reflection`, {
        decision: decision.trim(),
        reflection: text.trim()
      });
      onUpdated(r.cleared
        ? { decision: null, reflection: null, reflected_at: null }
        : { decision: r.decision, reflection: r.reflection, reflected_at: r.reflected_at });
      setEditing(Boolean(r.cleared));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (recorded && !editing) {
    return (
      <section className="mt-8 rounded-xl border border-ok/30 bg-ok-soft p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-ok">
          <Check className="size-4" />
          بازنگری ثبت شده
        </h2>
        {analysis.decision && (
          <p className="mb-2 text-[13px] font-bold leading-relaxed">
            تصمیمی که گرفتید: {analysis.decision}
          </p>
        )}
        {analysis.reflection && (
          <p className="text-justify text-[13px] leading-loose text-text-2">{analysis.reflection}</p>
        )}
        <p className="mt-3 text-[11px] text-text-4">ثبت‌شده در {faDate(analysis.reflected_at)}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
          ویرایش
        </Button>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-warn/30 bg-warn-soft p-5">
      <h2 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-warn">
        <NotebookPen className="size-4" />
        فاز پنجم — عمل و بازنگری
      </h2>
      <p className="mb-4 text-justify text-[12.5px] leading-loose text-text-2">
        تحلیل بالا فقط گزینه‌ها را روشن می‌کند. آنچه واقعاً تصمیم گرفتید و بعد چه شد،
        چیزی است که هیچ مدلی نمی‌تواند بنویسد — و همان بخشی است که دفعه بعد به کارتان می‌آید.
      </p>

      <form onSubmit={save}>
        <div className="mb-3">
          <Label htmlFor="rf-decision">تصمیمی که گرفتم</Label>
          <Input id="rf-decision" value={decision} maxLength={300}
                 onChange={(e) => setDecision(e.target.value)}
                 placeholder="در یک جمله" />
        </div>

        <div className="mb-3">
          <Label htmlFor="rf-text">چه شد و چه یاد گرفتم</Label>
          <textarea id="rf-text" rows={5} maxLength={4000} value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="لازم نیست همین حالا بنویسید؛ بعد از اینکه نتیجه را دیدید برگردید."
                    className="mt-1 w-full rounded-md border border-input bg-card p-3 text-[13px]
                               leading-loose focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-ring" />
          <p className="mt-1 text-[11px] text-text-4">
            {fa(text.length)} از {fa(4000)} نویسه
          </p>
        </div>

        {error && <p className="mb-2 text-[12px] text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {busy ? 'در حال ذخیره…' : 'ثبت بازنگری'}
          </Button>
          {recorded && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              انصراف
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
