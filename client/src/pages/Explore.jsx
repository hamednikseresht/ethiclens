import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fa, faDate } from '@/lib/fa';
import { Search, Globe, Eye, ExternalLink } from 'lucide-react';

/**
 * Analyses other people have published.
 *
 * Each card leaves the app for /a/<slug>, the server-rendered page. That is
 * deliberate: those pages are the ones search engines read, they render
 * without JavaScript, and they are already the canonical address anyone would
 * share. Re-implementing them inside the bundle would produce a second URL
 * for the same text and split whatever authority it earns.
 *
 * What this page adds over that crawled list is search and a category filter,
 * which a static page cannot offer.
 */
export default function Explore() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set('q', q.trim());
    if (category) params.set('category', category);

    try { setData(await api.get(`/api/explore?${params}`)); }
    catch (e) { setError(e.message); }
  }, [page, q, category]);

  // Debounced, so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const filtering = Boolean(q.trim() || category);

  return (
    <div className="mx-auto max-w-xl px-5 pb-6 pt-6">
      <h1 className="display mb-1.5 text-[30px] font-semibold leading-tight">تحلیل‌های عمومی</h1>
      <p className="mb-4 text-justify text-[13px] leading-loose text-text-3">
        دوراهی‌های واقعی که کاربران تحلیل کرده و برای استفاده دیگران منتشر کرده‌اند.
      </p>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-text-5" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
               placeholder="جست‌وجو در تحلیل‌های منتشرشده" className="pe-10" />
      </div>

      {data?.categories?.length > 0 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1
                        [-ms-overflow-style:none] [scrollbar-width:none]
                        [&::-webkit-scrollbar]:hidden">
          <Chip active={!category} onClick={() => { setCategory(''); setPage(1); }}>همه</Chip>
          {data.categories.map(c => (
            <Chip key={c.slug} active={category === c.slug}
                  onClick={() => { setCategory(c.slug); setPage(1); }}>
              {c.title}
              <span className="nums ms-1 opacity-60">{fa(c.count)}</span>
            </Chip>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {data && !data.items.length && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Globe className="mx-auto mb-3 size-8 text-text-5" />
          <p className="text-sm font-bold">
            {filtering ? 'چیزی پیدا نشد' : 'هنوز تحلیلی منتشر نشده است'}
          </p>
          {filtering ? (
            <Button variant="outline" size="sm" className="mt-4"
                    onClick={() => { setQ(''); setCategory(''); setPage(1); }}>
              پاک کردن فیلترها
            </Button>
          ) : (
            <>
              <p className="mt-1.5 text-justify text-xs leading-loose text-text-4">
                هر کسی می‌تواند تحلیلش را عمومی کند. اولین نفر باشید.
              </p>
              <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
                شروع تحلیل
              </Button>
            </>
          )}
        </div>
      )}

      {data?.items?.length > 0 && (
        <>
          <p className="mb-3 text-[11px] text-text-5">{fa(data.total)} تحلیل منتشرشده</p>

          <div className="space-y-3">
            {data.items.map(it => <Card key={it.slug} item={it} />)}
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

/**
 * A plain anchor, not a router link: the destination is outside the bundle,
 * so this has to be a real navigation. It also means the card behaves like a
 * link — middle-click, long-press, copy address all work.
 */
function Card({ item }) {
  return (
    <a href={`/a/${encodeURIComponent(item.slug)}`}
       className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-subtle">
      {item.category && (
        <span className="mb-2 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
          {item.category.title}
        </span>
      )}

      <h2 className="mb-1.5 flex items-start gap-1.5 text-sm font-bold leading-relaxed">
        <span className="grow">{item.title}</span>
        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-text-5" />
      </h2>

      {item.summary && (
        <p className="mb-2.5 line-clamp-3 text-justify text-xs leading-loose text-text-4">
          {item.summary}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-text-5">
        {item.domain && (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-bold text-text-4">
            {item.domain}
          </span>
        )}
        {item.publishedAt && <span>{faDate(item.publishedAt)}</span>}
        {item.author && <span>· {item.author}</span>}
        {item.views > 0 && (
          <span className="flex items-center gap-1">
            <Eye className="size-3" />
            <span className="nums">{fa(item.views)}</span>
          </span>
        )}
      </div>
    </a>
  );
}
