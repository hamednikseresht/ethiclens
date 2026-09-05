import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource, useAction, Panel, TextField, Status, Skeleton, Pill } from './ui';
import { Button } from '@/components/ui/button';
import { fa, faCount } from '@/lib/fa';

/**
 * User groups and what each is allowed.
 *
 * Both limits treat 0 as unlimited, which is the kind of convention that
 * silently produces a locked-out group when someone reads it as "none". It is
 * spelled out under every field rather than documented elsewhere.
 */
export default function Tiers() {
  const { data, error, loading, reload } = useResource('/api/admin/tiers');

  if (error) return <Status error={error} />;
  if (loading || !data) return <Skeleton rows={3} />;

  return (
    <div className="space-y-3">
      {data.items.map(t => <TierCard key={t.id} tier={t} onChanged={reload} />)}
    </div>
  );
}

function TierCard({ tier, onChanged }) {
  const [form, setForm] = useState({
    label: tier.label,
    daily_quota: tier.daily_quota,
    monthly_tokens: tier.monthly_tokens
  });
  const act = useAction(onChanged);

  const dirty = form.label !== tier.label
    || Number(form.daily_quota) !== tier.daily_quota
    || Number(form.monthly_tokens) !== tier.monthly_tokens;

  const save = () => act.run(() => api.put(`/api/admin/tiers/${tier.id}`, {
    label: form.label,
    daily_quota: Number(form.daily_quota),
    monthly_tokens: Number(form.monthly_tokens)
  }));

  return (
    <Panel title={tier.label}
           action={
             <div className="flex items-center gap-1.5">
               <Pill>{fa(tier.users)} کاربر</Pill>
               {tier.exclusiveModels > 0 && <Pill tone="info">{fa(tier.exclusiveModels)} مدل</Pill>}
             </div>
           }>
      <p className="ltr mb-3 text-[10.5px] text-text-5">{tier.key}</p>

      <TextField label="نام گروه" id={`t-l-${tier.id}`} value={form.label}
                 onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} />

      <TextField label="سهمیه روزانه تحلیل" id={`t-d-${tier.id}`} type="number" min="0"
                 value={form.daily_quota}
                 hint="صفر یعنی بی‌نهایت."
                 onChange={(e) => setForm(f => ({ ...f, daily_quota: e.target.value }))} />

      <TextField label="سقف توکن ماهانه" id={`t-t-${tier.id}`} type="number" min="0"
                 value={form.monthly_tokens}
                 hint={`صفر یعنی بی‌نهایت.${tier.monthly_tokens > 0 ? ` الان: ${faCount(tier.monthly_tokens)}` : ''}`}
                 onChange={(e) => setForm(f => ({ ...f, monthly_tokens: e.target.value }))} />

      <Status msg={act.msg} error={act.error} className="mb-2" />
      <Button size="sm" variant="primary" onClick={save} disabled={act.busy || !dirty}>ذخیره</Button>
    </Panel>
  );
}
