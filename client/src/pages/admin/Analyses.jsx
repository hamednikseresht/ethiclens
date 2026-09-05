import { useState } from 'react';
import { useResource, Panel, Status, Skeleton, Empty, Pill, TableWrap, Th, Td } from './ui';
import { Button } from '@/components/ui/button';
import { fa, faDate, faDuration } from '@/lib/fa';

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
  const { data, error, loading } = useResource(`/api/admin/analyses?page=${page}`);

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
              </tr>
            </thead>
            <tbody>
              {data.items.map(a => {
                const s = STATUS[a.status] || { label: a.status };
                return (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <Td className="min-w-[170px] font-bold leading-relaxed">{a.title || '—'}</Td>
                    <Td className="ltr whitespace-nowrap text-text-4">{a.email}</Td>
                    <Td className="ltr max-w-[150px] truncate text-text-4">{a.model || '—'}</Td>
                    <Td><Pill tone={s.tone}>{s.label}</Pill></Td>
                    <Td className="nums whitespace-nowrap text-text-4">
                      {a.duration_ms ? faDuration(a.duration_ms / 1000) : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-text-5">{faDate(a.created_at)}</Td>
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
    </Panel>
  );
}
