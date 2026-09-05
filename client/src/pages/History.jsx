import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fa, faDate } from '@/lib/fa';
import { Search, Star, NotebookPen, Globe, TriangleAlert, Clock } from 'lucide-react';

/**
 * Past analyses.
 *
 * The list carries the three things worth knowing at a glance: whether the
 * result came back whole, whether it was ever published, and whether the
 * person went back and recorded what they actually decided. That last one is
 * the point of the product's fifth phase, and a history that does not surface
 * it lets every analysis end at the reading.
 */

const PER_PAGE = 12;

export default function History() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');   // all | favorite | awaiting
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
    if (q.trim()) params.set('q', q.trim());
    if (filter === 'favorite') params.set('favorite', '1');
    if (filter === 'awaiting') params.set('reflected', '0');

    try { setData(await api.get(`/api/history?${params}`)); }
    catch (e) { setError(e.message); }
  }, [page, q, filter]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="mx-auto max-w-xl md:max-w-4xl px-5 pb-6 pt-6">
      <h1 className="display mb-4 text-[30px] font-semibold leading-tight">تاریخچه</h1>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-text-5" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
               placeholder="جست‌وجو در دوراهی‌ها" className="pe-10" />
      </div>

      <div className="mb-4 flex gap-1.5">
        {[
          ['all', 'همه'],
          ['favorite', 'نشان‌شده'],
          ['awaiting', 'منتظر بازنگری']
        ].map(([k, label]) => (
          <button key={k} onClick={() => { setFilter(k); setPage(1); }}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    filter === k
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border bg-card text-text-4'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!data && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {data && !data.items.length && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Clock className="mx-auto mb-3 size-8 text-text-5" />
          <p className="text-sm font-bold">
            {q || filter !== 'all' ? 'چیزی پیدا نشد' : 'هنوز تحلیلی نکرده‌اید'}
          </p>
          {!q && filter === 'all' && (
            <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
              اولین تحلیل را شروع کنید
            </Button>
          )}
        </div>
      )}

      {data?.items?.length > 0 && (
        <>
          <p className="mb-3 text-[11px] text-text-5">
            {fa(data.total)} تحلیل
          </p>
          <div className="space-y-3">
            {data.items.map(it => <Row key={it.id} item={it} onOpen={() => navigate(`/?id=${it.id}`)} />)}
          </div>

          {data.pages > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}>تازه‌تر</Button>
              <span className="nums text-[11px] text-text-5">
                {fa(page)} از {fa(data.pages)}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.pages}
                      onClick={() => setPage(p => p + 1)}>قدیمی‌تر</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ item, onOpen }) {
  const c = parseCompleteness(item.completeness);
  const partial = item.status === 'partial' || (c && !c.complete);

  return (
    <button onClick={onOpen}
            className="w-full rounded-xl border border-border bg-card p-4 text-start transition-colors hover:bg-subtle">
      <div className="mb-1.5 flex items-start gap-2">
        <h2 className="grow text-sm font-bold leading-relaxed">{item.title}</h2>
        {item.is_favorite ? <Star className="mt-0.5 size-3.5 shrink-0 fill-warn text-warn" /> : null}
      </div>

      {item.excerpt && (
        <p className="mb-2.5 line-clamp-2 text-xs leading-loose text-text-4">{item.excerpt}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Tag>{faDate(item.created_at)}</Tag>

        {item.status === 'error' && <Tag tone="danger">ناموفق</Tag>}
        {partial && (
          <Tag tone="warn"><TriangleAlert className="size-3" /> ناقص</Tag>
        )}
        {/* Boolean(), not a bare && : SQLite stores this flag as 0 or 1, and
            React renders a literal 0 rather than nothing when the left side
            of && is the number zero. It showed up as a stray digit between
            the date and the reflection tag. */}
        {Boolean(item.is_public) && <Tag tone="ok"><Globe className="size-3" /> عمومی</Tag>}

        {item.reflected_at
          ? <Tag tone="ok"><NotebookPen className="size-3" /> بازنگری شد</Tag>
          : (item.status === 'done' || item.status === 'partial') && <Tag>منتظر بازنگری</Tag>}
      </div>
    </button>
  );
}

function Tag({ children, tone }) {
  const tones = {
    danger: 'border-destructive/30 bg-destructive-soft text-destructive',
    warn:   'border-warn/30 bg-warn-soft text-warn',
    ok:     'border-ok/30 bg-ok-soft text-ok'
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
      tones[tone] || 'border-border bg-muted text-text-4'}`}>
      {children}
    </span>
  );
}

/** Stored as JSON text; a row written before the column existed has none. */
function parseCompleteness(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

