import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  useResource, useAction, Panel, TextField, SelectField, Toggle,
  Status, Skeleton, Empty, ConfirmButton, Pill, Spinner
} from './ui';
import { Button } from '@/components/ui/button';
import { fa } from '@/lib/fa';
import { Plus, Plug, Activity, ChevronDown, RefreshCw, Square, Search } from 'lucide-react';

/**
 * Providers and the models under them.
 *
 * Kept on one screen because the two are one decision: a provider without
 * models does nothing, and a model without a working provider key is a row
 * that fails at analysis time. Splitting them would hide the half that
 * explains the other.
 */
const MASK = '••••••••••••';

export default function Ai() {
  const providers = useResource('/api/admin/providers');
  const models = useResource('/api/admin/models');

  const reloadBoth = async () => { await providers.reload(); await models.reload(); };

  if (providers.error) return <Status error={providers.error} />;
  if (providers.loading || !providers.data) return <Skeleton rows={4} />;

  return (
    <div className="space-y-3">
      <Providers data={providers.data} onChanged={reloadBoth} />
      <Models models={models} providers={providers.data.items} onChanged={reloadBoth} />
    </div>
  );
}

/* ==========================================================================
   Providers
   ========================================================================== */

function Providers({ data, onChanged }) {
  const [adding, setAdding] = useState(false);

  return (
    <Panel title="ارائه‌دهندگان"
           hint="هر ارائه‌دهنده یک API سازگار با OpenAI است. کلید فقط روی سرور می‌ماند و هرگز به مرورگر برنمی‌گردد."
           action={
             <Button size="sm" variant="outline" onClick={() => setAdding(a => !a)}>
               <Plus className="size-3.5" />
               {adding ? 'بستن' : 'افزودن'}
             </Button>
           }>
      {adding && <AddProvider presets={data.presets}
                              onDone={() => { setAdding(false); onChanged(); }} />}

      {!data.items.length ? (
        <Empty>هنوز ارائه‌دهنده‌ای اضافه نشده است.</Empty>
      ) : (
        <div className="space-y-2">
          {data.items.map(p => <ProviderRow key={p.id} provider={p} onChanged={onChanged} />)}
        </div>
      )}
    </Panel>
  );
}

function AddProvider({ presets, onDone }) {
  const [preset, setPreset] = useState(presets[0]?.key || 'custom');
  const chosen = presets.find(p => p.key === preset);
  const [form, setForm] = useState({ label: '', base_url: '', api_key: '' });
  const act = useAction(onDone);

  // The preset fills the two fields nobody should have to remember, and stops
  // filling them the moment either has been edited by hand.
  const effective = {
    key: preset === 'custom' ? (form.label || '').toLowerCase().replace(/[^a-z0-9_-]/g, '') : preset,
    label: form.label || chosen?.label || '',
    base_url: form.base_url || chosen?.base_url || ''
  };

  const submit = (e) => {
    e.preventDefault();
    act.run(() => api.post('/api/admin/providers', {
      key: effective.key,
      label: effective.label,
      base_url: effective.base_url,
      api_key: form.api_key
    }), 'ارائه‌دهنده اضافه شد.');
  };

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border border-border bg-subtle p-3">
      <SelectField label="سرویس" id="p-preset" value={preset}
                   onChange={(e) => setPreset(e.target.value)}
                   options={presets.map(p => ({ value: p.key, label: p.label }))} />

      <TextField label="نام نمایشی" id="p-label" value={effective.label}
                 onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} />

      <TextField label="آدرس پایه" id="p-url" dir="ltr" value={effective.base_url}
                 onChange={(e) => setForm(f => ({ ...f, base_url: e.target.value }))}
                 placeholder="https://api.example.com/v1" />

      <TextField label="کلید API" id="p-key" type="password" dir="ltr"
                 value={form.api_key} hint={chosen?.hint || undefined}
                 onChange={(e) => setForm(f => ({ ...f, api_key: e.target.value }))} />

      <Status msg={act.msg} error={act.error} className="mb-2" />
      <Button type="submit" size="sm" variant="primary" disabled={act.busy}>
        {act.busy ? 'در حال افزودن…' : 'افزودن'}
      </Button>
    </form>
  );
}

function ProviderRow({ provider, onChanged }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    label: provider.label,
    base_url: provider.base_url,
    api_key: provider.api_key,      // already the mask when a key is stored
    enabled: !!provider.enabled
  });
  const [test, setTest] = useState(null);
  const [force, setForce] = useState(null);
  const [testing, setTesting] = useState(false);
  const act = useAction(onChanged);

  const save = () => act.run(() => api.put(`/api/admin/providers/${provider.id}`, form));

  const remove = (confirmed) => act.run(async () => {
    try {
      return await api.del(`/api/admin/providers/${provider.id}${confirmed ? '?force=1' : ''}`);
    } catch (e) {
      // The server refuses the first time when models would go with it, and
      // says how many. Surfaced as a question rather than retried silently.
      if (e.body?.needsForce) { setForce(e.body); return null; }
      throw e;
    }
  }, 'حذف شد.');

  const runTest = async () => {
    setTesting(true); setTest(null);
    try { setTest({ ok: true, ...(await api.post(`/api/admin/providers/${provider.id}/test`)) }); }
    catch (e) { setTest({ ok: false, error: e.message }); }
    finally { setTesting(false); }
  };

  return (
    <div className="rounded-lg border border-border">
      <button onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 p-3 text-start">
        <span className="grow">
          <span className="block text-[13px] font-bold">{provider.label}</span>
          <span className="ltr mt-0.5 block truncate text-[10.5px] text-text-5">{provider.base_url}</span>
        </span>
        {!provider.api_key && <Pill tone="danger">بدون کلید</Pill>}
        <Pill tone={provider.enabled ? 'ok' : undefined}>{provider.enabled ? 'فعال' : 'خاموش'}</Pill>
        <span className="nums whitespace-nowrap text-[10px] text-text-5">
          {fa(provider.modelsEnabled)}/{fa(provider.models)}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-text-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border p-3">
          <TextField label="نام نمایشی" id={`pl-${provider.id}`} value={form.label}
                     onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} />
          <TextField label="آدرس پایه" id={`pu-${provider.id}`} dir="ltr" value={form.base_url}
                     onChange={(e) => setForm(f => ({ ...f, base_url: e.target.value }))} />
          <TextField label="کلید API" id={`pk-${provider.id}`} type="password" dir="ltr"
                     value={form.api_key}
                     hint="خالی گذاشتن یا دست‌نزدن، کلید فعلی را نگه می‌دارد."
                     onChange={(e) => setForm(f => ({ ...f, api_key: e.target.value }))}
                     onFocus={(e) => { if (e.target.value === MASK) setForm(f => ({ ...f, api_key: '' })); }} />

          <Toggle label="فعال" checked={form.enabled}
                  onChange={(v) => setForm(f => ({ ...f, enabled: v }))} />

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

          {test && (
            <p className={`my-2 text-[12px] ${test.ok ? 'text-ok' : 'text-destructive'}`}>
              {test.ok
                ? `اتصال سالم است — ${test.model} (${fa(test.latencyMs ?? 0)} میلی‌ثانیه)`
                : test.error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={save} disabled={act.busy}>ذخیره</Button>
            <Button size="sm" variant="outline" onClick={runTest} disabled={testing}>
              {testing ? <Spinner /> : <Plug className="size-3.5" />}
              آزمایش اتصال
            </Button>
            <ModelSync provider={provider} onSynced={onChanged} />
            <ConfirmButton onConfirm={() => remove(false)} busy={act.busy}
                           className="text-destructive">
              حذف
            </ConfirmButton>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Bring the provider's model list in line with what its account offers.
 *
 * Fetches the catalogue, times one small request to every chat model, and
 * ranks them fastest first. What stays ticked becomes the provider's list;
 * whatever is left unticked is removed. The models already stored start
 * ticked, so applying without touching anything changes nothing but the order.
 *
 * Fetched on demand, not with the page: it is a live call to someone else's
 * API, it costs a request per model, and most visits never need it.
 */
const SYNC_WORKERS = 4;
const pause = (ms) => new Promise(r => setTimeout(r, ms));

function ModelSync({ provider, onSynced }) {
  const [list, setList] = useState(null);       // null | 'loading' | {error} | {provider, models}
  const [results, setResults] = useState({});   // model id -> 'testing' | {ok, latencyMs, error}
  const [picked, setPicked] = useState(() => new Set());
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState('');
  // Each run takes a number; bumping it stops the workers of the run before.
  // A plain flag would let a stopped run's in-flight workers carry on the
  // moment a new run reset it.
  const runId = useRef(0);
  const act = useAction(onSynced);

  useEffect(() => () => { runId.current++; }, []);

  const measure = async (ids) => {
    const run = ++runId.current;
    const queue = ids.map(id => ({ id, retried: false }));
    setRunning(true);

    const worker = async () => {
      while (queue.length && runId.current === run) {
        const job = queue.shift();
        setResults(r => ({ ...r, [job.id]: 'testing' }));
        let r;
        try { r = await api.post(`/api/admin/providers/${provider.id}/latency`, { model: job.id }); }
        catch (e) { r = { ok: false, error: e.message }; }

        // A rate limit says nothing about the model itself, so it goes back
        // in the queue once after a pause instead of ranking a good model last.
        if (!r.ok && r.status === 429 && !job.retried) {
          await pause(4000);
          queue.push({ ...job, retried: true });
          continue;
        }
        setResults(x => ({ ...x, [job.id]: r }));
      }
    };

    await Promise.all(Array.from({ length: SYNC_WORKERS }, worker));
    if (runId.current === run) setRunning(false);
  };

  const stop = () => { runId.current++; setRunning(false); };

  const open = async () => {
    setList('loading'); setResults({}); setFilter(''); act.clear();
    try {
      const data = await api.get(`/api/admin/providers/${provider.id}/remote-models`);
      setList(data);
      setPicked(new Set(data.models.filter(m => m.added).map(m => m.id)));
      measure(data.models.filter(m => m.chat).map(m => m.id));
    } catch (e) {
      setList({ error: e.message });
    }
  };

  const close = () => { stop(); setList(null); act.clear(); };

  // Fastest working models first, then the ones still waiting, then the ones
  // that failed, then the ones never tested because they are not chat models.
  // Ties keep the provider's own order so rows do not shuffle needlessly.
  const sorted = useMemo(() => {
    if (!list?.models) return [];
    const group = (m) => {
      const r = results[m.id];
      if (r?.ok) return 0;
      if (!m.chat) return 3;
      if (r && r !== 'testing') return 2;
      return 1;
    };
    return list.models
      .map((m, i) => ({ m, i, g: group(m), t: results[m.id]?.latencyMs ?? 0 }))
      .sort((a, b) => (a.g - b.g) || (a.t - b.t) || (a.i - b.i))
      .map(x => x.m);
  }, [list, results]);

  if (!list) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={open}>
          <RefreshCw className="size-3.5" />
          بروزرسانی مدل‌ها
        </Button>
        <Status msg={act.msg} />
      </>
    );
  }

  if (list === 'loading') return <Button size="sm" variant="outline" disabled><Spinner />دریافت فهرست…</Button>;
  if (list.error) {
    return (
      <div className="flex w-full items-center gap-2">
        <Status error={list.error} className="grow" />
        <Button size="sm" variant="ghost" onClick={close}>بستن</Button>
      </div>
    );
  }

  const toggle = (id) => setPicked(p => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const tested = list.models.filter(m => m.chat && results[m.id] && results[m.id] !== 'testing').length;
  const testable = list.models.filter(m => m.chat).length;
  const untested = list.models.filter(m => m.chat && !results[m.id]).map(m => m.id);
  const healthy = list.models.filter(m => results[m.id]?.ok).map(m => m.id);

  const adding = list.models.filter(m => picked.has(m.id) && !m.added).length;
  const removing = list.models.filter(m => !picked.has(m.id) && m.added).length;

  const q = filter.trim().toLowerCase();
  const shown = q ? sorted.filter(m => m.id.toLowerCase().includes(q)) : sorted;

  const apply = () => act.run(
    () => api.put(`/api/admin/providers/${provider.id}/models`, {
      models: sorted.filter(m => picked.has(m.id)).map(m => m.id)
    }),
    `${fa(picked.size)} مدل ماند؛ ${fa(adding)} افزوده و ${fa(removing)} حذف شد.`
  ).then(r => { if (r) { stop(); setList(null); } });

  return (
    <div className="w-full rounded-lg border border-border bg-subtle p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="grow text-[12px] font-bold">
          مدل‌های {list.provider} — {fa(list.models.length)} مدل
        </h4>
        <Button size="sm" variant="ghost" onClick={close}>بستن</Button>
      </div>

      <p className="mb-2 text-justify text-[11px] leading-loose text-text-4">
        به هر مدل گفتگو یک درخواست کوچک فرستاده می‌شود و فهرست به ترتیب سرعت پاسخ مرتب می‌شود.
        مدل‌های تیک‌خورده فهرست این ارائه‌دهنده می‌شوند و بقیه حذف می‌شوند.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {running ? (
          <>
            <span className="nums flex items-center gap-1.5 text-[11.5px] text-text-4">
              <Spinner className="size-3.5" />
              آزمایش {fa(tested)} از {fa(testable)}
            </span>
            <Button size="sm" variant="ghost" onClick={stop}>
              <Square className="size-3" />
              توقف
            </Button>
          </>
        ) : untested.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => measure(untested)}>
            <Activity className="size-3.5" />
            آزمایش {fa(untested.length)} مدل باقی‌مانده
          </Button>
        )}
        <span className="grow" />
        <Button size="sm" variant="ghost" disabled={!healthy.length}
                onClick={() => setPicked(p => new Set([...p, ...healthy]))}>
          تیک همه سالم‌ها
        </Button>
        <Button size="sm" variant="ghost"
                onClick={() => setPicked(new Set(list.models.filter(m => m.isDefault).map(m => m.id)))}>
          برداشتن همه
        </Button>
      </div>

      {testable > 0 && (
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full bg-primary transition-[width]"
               style={{ width: `${Math.round((tested / testable) * 100)}%` }} />
        </div>
      )}

      {list.models.length > 12 && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-5" />
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
                 placeholder="جستجو در شناسه مدل‌ها" aria-label="جستجو در شناسه مدل‌ها"
                 className="h-9 w-full rounded-md border border-input bg-card ps-8 pe-3 text-[12px]
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
      )}

      <div className="mb-3 max-h-80 space-y-0.5 overflow-y-auto">
        {!shown.length && <p className="py-3 text-center text-[12px] text-text-4">مدلی با این شناسه نیست.</p>}
        {shown.map(m => (
          <label key={m.id}
                 className={`flex items-center gap-2 rounded px-1 py-1 ${
                   m.isDefault ? 'cursor-default' : 'cursor-pointer hover:bg-muted'}`}>
            <input type="checkbox" checked={picked.has(m.id)} disabled={m.isDefault}
                   onChange={() => toggle(m.id)}
                   className="size-3.5 shrink-0 accent-[var(--color-primary)]" />
            <span className="ltr grow truncate text-[11.5px]" title={m.id}>{m.id}</span>
            {m.isDefault && <Pill tone="info">پیش‌فرض</Pill>}
            {m.added && !m.isDefault && <Pill>فعلی</Pill>}
            {m.added && !m.listed && <Pill tone="warn">در فهرست سرویس نیست</Pill>}
            <Latency chat={m.chat} result={results[m.id]} />
          </label>
        ))}
      </div>

      <Status msg={act.msg} error={act.error} className="mb-2" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="nums grow text-[11.5px] text-text-4">
          {fa(picked.size)} انتخاب
          {adding > 0 && <> · <span className="text-ok">{fa(adding)} افزوده</span></>}
          {removing > 0 && <> · <span className="text-destructive">{fa(removing)} حذف</span></>}
        </span>
        {removing > 0 ? (
          <ConfirmButton onConfirm={apply} busy={act.busy}
                         question={`${fa(removing)} مدل حذف می‌شود؛ مطمئنید؟`}
                         variant="primary">
            اعمال
          </ConfirmButton>
        ) : (
          <Button size="sm" variant="primary" onClick={apply} disabled={act.busy}>
            اعمال
          </Button>
        )}
      </div>
    </div>
  );
}

/** A model's response time, or why it has none. */
function Latency({ chat, result }) {
  const cls = 'nums shrink-0 text-[10.5px]';
  if (!chat) return <span className={`${cls} text-text-5`}>غیر گفتگو</span>;
  if (!result) return <span className={`${cls} text-text-5`}>—</span>;
  if (result === 'testing') return <Spinner className="size-3 shrink-0 text-text-5" />;
  if (!result.ok) {
    return <span className={`${cls} text-destructive`} title={result.error}>ناموفق</span>;
  }
  const s = result.latencyMs / 1000;
  const tone = s < 3 ? 'text-ok' : s < 10 ? 'text-warn' : 'text-text-4';
  return <span className={`${cls} ${tone}`}>{fa(s.toFixed(1)).replace('.', '٫')} ثانیه</span>;
}

/* ==========================================================================
   Models
   ========================================================================== */

function Models({ models, providers, onChanged }) {
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const [adding, setAdding] = useState(false);

  const runProbe = async () => {
    setProbing(true); setProbe(null);
    try { setProbe(await api.post('/api/admin/models/probe', {})); }
    catch (e) { setProbe({ error: e.message }); }
    finally { setProbing(false); }
  };

  if (models.loading || !models.data) return <Skeleton rows={3} />;
  if (models.error) return <Status error={models.error} />;

  const byProvider = {};
  for (const m of models.data) (byProvider[m.provider_label] ||= []).push(m);

  return (
    <Panel title="مدل‌ها"
           hint="آزمایش گروهی یک درخواست کوچک به هر مدل فعال می‌فرستد و آن‌هایی را که جواب نمی‌دهند نشان می‌دهد."
           action={
             <Button size="sm" variant="outline" onClick={() => setAdding(a => !a)}>
               <Plus className="size-3.5" />
               {adding ? 'بستن' : 'دستی'}
             </Button>
           }>
      {adding && <AddModel providers={providers} onDone={() => { setAdding(false); onChanged(); }} />}

      <div className="mb-3">
        <Button size="sm" variant="outline" onClick={runProbe} disabled={probing}>
          {probing ? <Spinner /> : <Activity className="size-3.5" />}
          {probing ? 'در حال آزمایش…' : 'آزمایش همه مدل‌ها'}
        </Button>
      </div>

      {probe && !probe.error && (
        <div className="mb-3 rounded-lg border border-border bg-subtle p-3">
          <p className="mb-2 text-[12px] font-bold">
            {fa(probe.ok)} سالم، {fa(probe.broken)} خراب از {fa(probe.total)}
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {probe.results.map(r => (
              <li key={r.id} className="flex items-baseline gap-2 text-[11.5px]">
                <span className={`shrink-0 ${r.ok ? 'text-ok' : 'text-destructive'}`}>
                  {r.ok ? '✓' : '✕'}
                </span>
                <span className="ltr grow truncate">{r.model}</span>
                <span className="nums shrink-0 text-text-5">
                  {r.ok ? `${fa(r.latencyMs ?? 0)}ms` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {probe?.error && <Status error={probe.error} className="mb-3" />}

      {!models.data.length ? (
        <Empty>هنوز مدلی اضافه نشده است.</Empty>
      ) : (
        Object.entries(byProvider).map(([label, list]) => (
          <div key={label} className="mb-4 last:mb-0">
            <h3 className="mb-1.5 text-[10px] font-bold tracking-wide text-text-5">{label}</h3>
            <div className="space-y-1.5">
              {list.map(m => <ModelRow key={m.id} model={m} onChanged={onChanged} />)}
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

function AddModel({ providers, onDone }) {
  const [form, setForm] = useState({ provider_id: providers[0]?.id || '', model_id: '', label: '' });
  const act = useAction(onDone);

  const submit = (e) => {
    e.preventDefault();
    act.run(() => api.post('/api/admin/models', {
      provider_id: Number(form.provider_id),
      model_id: form.model_id,
      label: form.label
    }), 'اضافه شد.');
  };

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border border-border bg-subtle p-3">
      <SelectField label="ارائه‌دهنده" id="m-prov" value={form.provider_id}
                   onChange={(e) => setForm(f => ({ ...f, provider_id: e.target.value }))}
                   options={providers.map(p => ({ value: p.id, label: p.label }))} />
      <TextField label="شناسه مدل" id="m-id" dir="ltr" required value={form.model_id}
                 onChange={(e) => setForm(f => ({ ...f, model_id: e.target.value }))}
                 placeholder="meta/llama-3.1-70b-instruct" />
      <TextField label="نام نمایشی" id="m-label" value={form.label}
                 hint="خالی بگذارید تا از شناسه ساخته شود."
                 onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} />
      <Status msg={act.msg} error={act.error} className="mb-2" />
      <Button type="submit" size="sm" variant="primary" disabled={act.busy}>افزودن</Button>
    </form>
  );
}

function ModelRow({ model, onChanged }) {
  const act = useAction(onChanged);

  const toggle = () => act.run(() => api.put(`/api/admin/models/${model.id}`, { enabled: !model.enabled }));
  const remove = () => act.run(() => api.del(`/api/admin/models/${model.id}`), 'حذف شد.');

  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="flex items-center gap-2">
        <span className="grow overflow-hidden">
          <span className="block truncate text-[12.5px] font-bold">{model.label}</span>
          <span className="ltr block truncate text-[10.5px] text-text-5">{model.model_id}</span>
        </span>
        <Pill tone={model.min_tier === 'basic' ? undefined : 'info'}>{model.min_tier}</Pill>
        <button onClick={toggle} disabled={act.busy}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  model.enabled ? 'border-ok/30 bg-ok-soft text-ok'
                                : 'border-border bg-muted text-text-4'}`}>
          {model.enabled ? 'فعال' : 'خاموش'}
        </button>
        <ConfirmButton onConfirm={remove} busy={act.busy} className="text-destructive">حذف</ConfirmButton>
      </div>
      <Status error={act.error} className="mt-1.5" />
    </div>
  );
}
