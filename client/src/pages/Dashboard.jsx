import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { fa, faDuration } from '@/lib/fa';
import { NotebookPen, ArrowLeft } from 'lucide-react';

/**
 * Your own numbers.
 *
 * Analyses awaiting reflection lead, because that is the phase the product
 * exists for and the one people skip. Everything else here is a record of
 * what happened; that block is the only thing asking for something to be
 * done, so it is the only thing above the fold.
 */
export default function Dashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/history/stats').then(setStats).catch(e => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-xl md:max-w-4xl px-5 py-10">
        <p className="rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl md:max-w-4xl px-5 pb-6 pt-6">
      <h1 className="display mb-1 text-[30px] font-semibold leading-tight">
        سلام {user?.name?.split(' ')[0] || ''}
      </h1>
      <p className="mb-5 text-[13px] text-text-4">خلاصه کارهای شما.</p>

      {!stats ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />)}
        </div>
      ) : stats.total === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="mb-1 text-sm font-bold">هنوز تحلیلی نکرده‌اید</p>
          <p className="mb-4 text-justify text-xs leading-loose text-text-4">
            یک دوراهی واقعی را بنویسید تا از هشت منظر بررسی شود.
          </p>
          <Button variant="primary" onClick={() => navigate('/')}>
            شروع اولین تحلیل
            <ArrowLeft className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.awaiting > 0 && (
            <button onClick={() => navigate('/history')}
                    className="flex w-full items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-start">
              <NotebookPen className="mt-0.5 size-5 shrink-0 text-warn" />
              <span>
                <span className="block text-sm font-bold text-warn">
                  {fa(stats.awaiting)} تحلیل منتظر بازنگری است
                </span>
                <span className="mt-1 block text-justify text-[12px] leading-loose text-warn/90">
                  تحلیل تا وقتی ثبت نکنید واقعاً چه کردید نیمه‌کاره است. فاز پنجم همین است.
                </span>
              </span>
            </button>
          )}

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="کل تحلیل" value={fa(stats.total)} />
              <Stat label="کامل" value={fa(stats.done)} />
              <Stat label="بازنگری‌شده" value={fa(stats.reflected)} />
              <Stat label="نشان‌شده" value={fa(stats.favorites)} />
              <Stat label="امروز" value={stats.quota ? `${fa(stats.today)}/${fa(stats.quota)}` : fa(stats.today)} />
              <Stat label="میانگین زمان" value={faDuration((stats.avgMs || 0) / 1000)} />
            </div>
          </section>

          {stats.daily?.length > 0 && <Activity daily={stats.daily} />}

          {stats.models?.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-bold">مدل‌هایی که استفاده کرده‌اید</h2>
              <ul className="space-y-1.5">
                {stats.models.map(m => (
                  <li key={m.model || 'unknown'} className="flex items-baseline gap-2 text-[12px]">
                    <span className="ltr grow truncate text-text-2">{m.model || '—'}</span>
                    <span className="nums text-text-4">{fa(m.c)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Thirty days of activity.
 *
 * Quiet days are missing from the query rather than zero, so the series is
 * rebuilt across the whole window — otherwise a fortnight off compresses away
 * and the chart reads as unbroken activity.
 */
function Activity({ daily }) {
  const byDate = new Map(daily.map(d => [d.d, d.c]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, count: byDate.get(key) || 0 });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-bold">فعالیت ۳۰ روز اخیر</h2>
      <p className="mb-3 text-[11px] text-text-5">{fa(total)} تحلیل در این بازه.</p>
      <div dir="ltr" className="flex h-20 items-end gap-[2px]">
        {days.map(d => (
          <div key={d.key} className="flex-1 rounded-t-sm bg-primary/80"
               style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }}
               title={`${d.key}: ${d.count}`} />
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-subtle p-2.5 text-center">
      <div className="nums text-[17px] font-bold">{value}</div>
      <div className="mt-0.5 text-[10px] text-text-5">{label}</div>
    </div>
  );
}
