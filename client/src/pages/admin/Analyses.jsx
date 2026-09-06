import { useState } from 'react';
import { useResource, useAction, Panel, Status, Skeleton, Empty, Pill, TableWrap, Th, Td } from './ui';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { fa, faDate, faDuration } from '@/lib/fa';
import { Trash2, ExternalLink, Globe } from 'lucide-react';

/**
 * Every analysis the system has run.
 *
 * A table rather than cards: the columns are short and the reason to be here
 * is scanning for the odd one out — a failure, a model that is suddenly slow.
 * It scrolls inside its own box so the page never moves sideways.
 */
const STATUS = {
  done:    { tone: 'ok',     label: 'کامل' },
  partial: { tone: 'warn',   label: 'ناقص' },
  error:   { tone: 'danger', label: 'ناموفق' },
  running: { tone: 'info',   label: 'در حال اجرا' }
};

export default function Analyses() {
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null);      // the analysis being removed
  const { data, error, loading, reload } = useResource(`/api/admin/analyses?page=${page}`);

  if (error) return <Status error={error} />;
  if (loading && !data) return <Skeleton rows={4} />;

  return (
    <Panel title="تحلیل‌های ثبت‌شده"
           hint={data ? `${fa(data.total)} تحلیل در کل سامانه.` : undefined}>
      {!data?.items?.length ? (
        <Empty>هنوز تحلیلی ثبت نشده است.</Empty>
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr className="border-b border-border-strong">
                <Th>عنوان</Th>
                <Th>کاربر</Th>
                <Th>مدل</Th>
                <Th>وضعیت</Th>
                <Th>زمان</Th>
                <Th>تاریخ</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(a => {
                const s = STATUS[a.status] || { label: a.status };
                return (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <Td className="min-w-[170px] font-bold leading-relaxed">
                      {a.title || '—'}
                      {Boolean(a.is_public) && (
                        <span className="ms-1.5 inline-flex items-center gap-1 rounded-full
                                         bg-primary-soft px-1.5 py-0.5 text-[9px] font-bold text-primary">
                          <Globe className="size-2.5" /> منتشرشده
                        </span>
                      )}
                    </Td>
                    <Td className="ltr whitespace-nowrap text-text-4">{a.email}</Td>
                    <Td className="ltr max-w-[150px] truncate text-text-4">{a.model || '—'}</Td>
                    <Td><Pill tone={s.tone}>{s.label}</Pill></Td>
                    <Td className="nums whitespace-nowrap text-text-4">
                      {a.duration_ms ? faDuration(a.duration_ms / 1000) : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-text-5">{faDate(a.created_at)}</Td>
                    <Td>
                      <button onClick={() => setTarget(a)}
                              title={`حذف «${a.title || a.id}»`}
                              aria-label={`حذف «${a.title || a.id}»`}
                              className="grid size-8 place-items-center rounded-full text-text-5
                                         transition-colors hover:bg-destructive-soft hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>

          {data.pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}>تازه‌تر</Button>
              <span className="nums text-[11px] text-text-5">{fa(page)} از {fa(data.pages)}</span>
              <Button variant="outline" size="sm" disabled={page >= data.pages}
                      onClick={() => setPage(p => p + 1)}>قدیمی‌تر</Button>
            </div>
          )}
        </>
      )}

      {target && (
        <DeleteSheet analysis={target}
                     onClose={() => setTarget(null)}
                     onDone={() => { setTarget(null); reload(); }} />
      )}
    </Panel>
  );
}

/**
 * Confirming the removal of someone else's analysis.
 *
 * A dialog rather than an inline row, because the row lives inside a table
 * that scrolls sideways — a confirmation the admin has to find again after
 * scrolling is how the wrong thing gets deleted.
 *
 * A published analysis is offered unpublishing first and given the equal
 * visual weight of the two buttons, because it is nearly always what was
 * meant: it takes the page off the public site and out of the sitemap while
 * the owner keeps their own copy. Deleting is the irreversible one, and it
 * breaks every link anyone already has.
 */
function DeleteSheet({ analysis, onClose, onDone }) {
  const act = useAction(onDone);
  const published = Boolean(analysis.is_public);
  const path = `/analysis/${analysis.category_slug || 'public'}/${encodeURIComponent(analysis.slug || '')}`;

  // force=1 is what the server requires for a published row. It is sent only
  // from this dialog, where the consequence is on screen.
  const remove = () => act.run(
    () => api.del(`/api/admin/analyses/${analysis.id}${published ? '?force=1' : ''}`),
    'حذف شد.'
  );

  const unpublish = () => act.run(
    () => api.post(`/api/admin/analyses/${analysis.id}/unpublish`),
    'از انتشار خارج شد.'
  );

  return (
    <Sheet title="حذف تحلیل" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-subtle p-3">
          <p className="text-[13px] font-bold leading-relaxed">{analysis.title || `#${fa(analysis.id)}`}</p>
          <p className="ltr mt-1 text-[11px] text-text-5">{analysis.email}</p>
        </div>

        <p className="text-[12.5px] leading-loose text-text-3">
          این تحلیل برای همیشه پاک می‌شود؛ متن دوراهی، نتیجه و بازنگری کاربر با آن می‌رود
          و بازگردانی ندارد. این کار در گزارش رخدادها ثبت می‌شود.
        </p>

        {published && (
          <div className="space-y-2 rounded-lg border border-warn/30 bg-warn-soft p-3">
            <p className="text-[12.5px] leading-loose text-warn">
              این تحلیل منتشر شده و نشانی عمومی دارد
              {analysis.views > 0 && ` و ${fa(analysis.views)} بار دیده شده است`}.
              با حذف، آن نشانی برای هرکس که لینک را دارد و برای موتورهای جست‌وجو ۴۰۴ می‌شود.
              اگر فقط می‌خواهید از دید عموم خارج شود، آن را از انتشار درآورید — کاربر
              نسخه خودش را نگه می‌دارد.
            </p>
            <a href={path} target="_blank" rel="noopener"
               className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
              <ExternalLink className="size-3" /> دیدن صفحه عمومی
            </a>
          </div>
        )}

        <Status msg={act.msg} error={act.error} />

        <div className="flex flex-wrap gap-2">
          {published && (
            <Button variant="primary" disabled={act.busy} onClick={unpublish}>
              فقط از انتشار درآور
            </Button>
          )}
          <Button variant="destructive" disabled={act.busy} onClick={remove}>
            <Trash2 className="size-3.5" />
            {published ? 'حذف کامل' : 'حذف تحلیل'}
          </Button>
          <Button variant="outline" disabled={act.busy} onClick={onClose}>انصراف</Button>
        </div>
      </div>
    </Sheet>
  );
}
