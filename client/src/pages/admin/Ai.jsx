import { useState } from 'react';
import { api } from '@/lib/api';
import {
  useResource, useAction, Panel, TextField, SelectField, Toggle,
  Status, Skeleton, Empty, ConfirmButton, Pill, Spinner
} from './ui';
import { Button } from '@/components/ui/button';
import { fa } from '@/lib/fa';
import { Plus, Plug, ListPlus, Activity, ChevronDown } from 'lucide-react';

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
            <RemoteModels provider={provider} onAdded={onChanged} />
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
 * The models the provider account actually has.
 *
 * Fetched on demand, not with the page: it is a live call to someone else's
 * API, it can be slow, and most visits to this panel never need it.
 */
function RemoteModels({ provider, onAdded }) {
  const [state, setState] = useState(null);   // null | 'loading' | {models} | {error}
  const [picked, setPicked] = useState(() => new Set());
  const act = useAction(onAdded);

  const open = async () => {
    setState('loading');
    try { setState(await api.get(`/api/admin/providers/${provider.id}/remote-models`)); }
    catch (e) { setState({ error: e.message }); }
  };

  const toggle = (id) => setPicked(p => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const add = () => act.run(() => api.post('/api/admin/models', {
    provider_id: provider.id,
    models: [...picked].map(id => ({ model_id: id }))
  }), `${fa(picked.size)} مدل اضافه شد.`).then(() => setPicked(new Set()));

  if (!state) {
    return (
      <Button size="sm" variant="outline" onClick={open}>
        <ListPlus className="size-3.5" />
        مدل‌های سرویس
      </Button>
    );
  }

  if (state === 'loading') return <Button size="sm" variant="outline" disabled><Spinner /></Button>;
  if (state.error) return <p className="w-full text-[12px] text-destructive">{state.error}</p>;

  const available = state.models.filter(m => !m.added);

  return (
    <div className="w-full rounded-lg border border-border bg-subtle p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="grow text-[12px] font-bold">
          مدل‌های {state.provider} — {fa(available.length)} تای تازه
        </h4>
        <Button size="sm" variant="ghost" onClick={() => setState(null)}>بستن</Button>
      </div>

      {!available.length ? (
        <p className="text-[12px] text-text-4">همه مدل‌های این سرویس از قبل اضافه شده‌اند.</p>
      ) : (
        <>
          <div className="mb-2 max-h-56 space-y-1 overflow-y-auto">
            {available.map(m => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)}
                       className="size-3.5 accent-[var(--color-primary)]" />
                <span className="ltr grow truncate text-[11.5px]">{m.id}</span>
              </label>
            ))}
          </div>
          <Status msg={act.msg} error={act.error} className="mb-2" />
          <Button size="sm" variant="primary" disabled={!picked.size || act.busy} onClick={add}>
            افزودن {picked.size ? fa(picked.size) : ''}
          </Button>
        </>
      )}
    </div>
  );
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
