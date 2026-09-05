import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  useResource, useAction, Panel, TextField, SelectField, Status,
  Skeleton, Empty, ConfirmButton, Pill, Spinner
} from './ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fa, faCount, faDate } from '@/lib/fa';
import { Search, ChevronDown, MailCheck, ShieldCheck } from 'lucide-react';

/**
 * Users, and the two things an admin actually comes here to do: let somebody
 * in, or find out why somebody is using more than expected.
 *
 * Pending accounts are the default filter when any are waiting. An admin who
 * opens this page during signup week wants the queue, not an alphabetical
 * list with the queue buried in it.
 */
const STATUSES = [
  { value: '',          label: 'همه' },
  { value: 'pending',   label: 'در انتظار' },
  { value: 'active',    label: 'فعال' },
  { value: 'suspended', label: 'معلق' },
  { value: 'rejected',  label: 'ردشده' }
];

export default function Users() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('/api/admin/users?page=1');
  const { data, error, loading, reload } = useResource(query);

  // Debounced into the resource path, so typing does not fire a request per
  // keystroke and the hook still owns the fetching.
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ page: String(page) });
      if (q.trim()) p.set('q', q.trim());
      if (status) p.set('status', status);
      setQuery(`/api/admin/users?${p}`);
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, status, page]);

  if (error) return <Status error={error} />;

  return (
    <div className="space-y-3">
      <Panel>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-text-5" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                 placeholder="جست‌وجو در نام و ایمیل" className="pe-10" />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1
                        [-ms-overflow-style:none] [scrollbar-width:none]
                        [&::-webkit-scrollbar]:hidden">
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => { setStatus(s.value); setPage(1); }}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                      status === s.value ? 'border-primary bg-primary-soft text-primary'
                                         : 'border-border bg-card text-text-4'}`}>
              {s.label}
              {data?.counts?.[s.value] > 0 && (
                <span className="nums ms-1 opacity-60">{fa(data.counts[s.value])}</span>
              )}
            </button>
          ))}
        </div>
      </Panel>

      {loading && !data && <Skeleton rows={4} />}

      {data && !data.items.length && <Empty>کاربری با این شرایط پیدا نشد.</Empty>}

      {data?.items?.map(u => (
        <UserCard key={u.id} user={u} tiers={data.tiers} onChanged={reload} />
      ))}

      {data?.pages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}>تازه‌تر</Button>
          <span className="nums text-[11px] text-text-5">{fa(page)} از {fa(data.pages)}</span>
          <Button variant="outline" size="sm" disabled={page >= data.pages}
                  onClick={() => setPage(p => p + 1)}>قدیمی‌تر</Button>
        </div>
      )}
    </div>
  );
}

const STATUS_TONE = { active: 'ok', pending: 'warn', suspended: 'danger', rejected: 'danger' };
const STATUS_LABEL = { active: 'فعال', pending: 'در انتظار', suspended: 'معلق', rejected: 'ردشده' };

function UserCard({ user, tiers, onChanged }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="flex w-full items-start gap-2 p-4 text-start">
        <span className="grow overflow-hidden">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-bold">{user.name || '—'}</span>
            {user.role === 'admin' && <Pill tone="info">مدیر</Pill>}
          </span>
          <span className="ltr mt-0.5 block truncate text-[11px] text-text-5">{user.email}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status] || user.status}</Pill>
            <Pill>{user.tierLabel}</Pill>
            {!user.email_valid && <Pill tone="warn">ایمیل مشکوک</Pill>}
          </span>
        </span>
        <ChevronDown className={`mt-1 size-4 shrink-0 text-text-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <UserDetail user={user} tiers={tiers} onChanged={onChanged} />}
    </div>
  );
}

function UserDetail({ user, tiers, onChanged }) {
  const [form, setForm] = useState({
    name: user.name || '',
    role: user.role,
    status: user.status,
    tier: user.tier,
    quota_override: user.quota_override ?? '',
    token_override: user.token_override ?? ''
  });
  const act = useAction(onChanged);
  const [note, setNote] = useState('');
  const [newPass, setNewPass] = useState('');

  const save = () => act.run(() => api.put(`/api/admin/users/${user.id}`, form));
  const review = (decision) =>
    act.run(() => api.post(`/api/admin/users/${user.id}/review`, { decision, note }),
            decision === 'approve' ? 'تأیید شد.' : 'رد شد.');
  const checkEmail = () => act.run(() => api.post(`/api/admin/users/${user.id}/check-email`), 'بررسی شد.');
  const verifyEmail = () => act.run(() => api.post(`/api/admin/users/${user.id}/verify-email`, { verified: true }), 'تأیید شد.');
  const resetPass = () => act.run(() => api.post(`/api/admin/users/${user.id}/reset-password`, { password: newPass }), 'رمز عوض شد.')
    .then(() => setNewPass(''));
  const remove = () => act.run(() => api.del(`/api/admin/users/${user.id}`), 'حذف شد.');

  return (
    <div className="border-t border-border p-4">
      {/* Usage first: it is the evidence behind whatever decision follows. */}
      <div className="mb-4 grid grid-cols-4 gap-2">
        <Mini label="تحلیل" value={fa(user.analyses)} />
        <Mini label="امروز" value={`${fa(user.todayAnalyses)}/${user.effectiveQuota ? fa(user.effectiveQuota) : '∞'}`} />
        <Mini label="توکن ماه" value={faCount(user.monthTokens)} />
        <Mini label="کل توکن" value={faCount(user.totalTokens)} />
      </div>

      <div className="mb-3 space-y-1 text-[11px] text-text-5">
        <p>عضویت: {faDate(user.created_at)}</p>
        {user.last_login_at && <p>آخرین ورود: {faDate(user.last_login_at)}</p>}
        {user.email_check_note && <p className="text-warn">{user.email_check_note}</p>}
        {user.review_note && <p>یادداشت بررسی: {user.review_note}</p>}
      </div>

      {user.status === 'pending' && (
        <div className="mb-4 rounded-lg border border-warn/30 bg-warn-soft p-3">
          <p className="mb-2 text-[12px] font-bold text-warn">این حساب منتظر تصمیم شماست.</p>
          <Input value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="یادداشت (اختیاری، در ایمیل رد فرستاده می‌شود)"
                 className="mb-2 h-9 text-sm" />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={act.busy}
                    onClick={() => review('approve')}>تأیید</Button>
            <Button size="sm" variant="outline" disabled={act.busy}
                    onClick={() => review('reject')}>رد</Button>
          </div>
        </div>
      )}

      <TextField label="نام" id={`u-name-${user.id}`} value={form.name}
                 onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />

      <SelectField label="نقش" id={`u-role-${user.id}`} value={form.role}
                   onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                   options={[{ value: 'user', label: 'کاربر' }, { value: 'admin', label: 'مدیر' }]} />

      <SelectField label="وضعیت" id={`u-status-${user.id}`} value={form.status}
                   onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                   options={STATUSES.filter(s => s.value).map(s => ({ value: s.value, label: s.label }))} />

      <SelectField label="گروه" id={`u-tier-${user.id}`} value={form.tier}
                   onChange={(e) => setForm(f => ({ ...f, tier: e.target.value }))}
                   options={tiers.map(t => ({ value: t.key, label: t.label }))} />

      <TextField label="سهمیه روزانه اختصاصی" id={`u-q-${user.id}`} type="number" min="0"
                 value={form.quota_override}
                 hint="خالی بگذارید تا از گروه ارث ببرد."
                 onChange={(e) => setForm(f => ({ ...f, quota_override: e.target.value }))} />

      <TextField label="سقف توکن ماهانه اختصاصی" id={`u-t-${user.id}`} type="number" min="0"
                 value={form.token_override}
                 hint="خالی بگذارید تا از گروه ارث ببرد. صفر یعنی بی‌نهایت."
                 onChange={(e) => setForm(f => ({ ...f, token_override: e.target.value }))} />

      <Status msg={act.msg} error={act.error} className="my-2" />

      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={save} disabled={act.busy}>ذخیره</Button>
        <Button size="sm" variant="outline" onClick={checkEmail} disabled={act.busy}>
          <MailCheck className="size-3.5" />بررسی ایمیل
        </Button>
        <Button size="sm" variant="outline" onClick={verifyEmail} disabled={act.busy}>
          <ShieldCheck className="size-3.5" />تأیید دستی ایمیل
        </Button>
      </div>

      <div className="mb-3 rounded-lg border border-border p-3">
        <TextField label="تعیین رمز تازه" id={`u-pw-${user.id}`} type="password" dir="ltr"
                   value={newPass} minLength={8}
                   hint="دست‌کم ۸ نویسه. کاربر خبردار نمی‌شود، پس خودتان به او بگویید."
                   onChange={(e) => setNewPass(e.target.value)} />
        <Button size="sm" variant="outline" disabled={act.busy || newPass.length < 8}
                onClick={resetPass}>
          تغییر رمز
        </Button>
      </div>

      <ConfirmButton onConfirm={remove} busy={act.busy}
                     question="حساب و همه تحلیل‌هایش حذف شود؟"
                     className="text-destructive">
        حذف حساب
      </ConfirmButton>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-lg bg-subtle p-2 text-center">
      <div className="nums text-[13px] font-bold">{value}</div>
      <div className="mt-0.5 text-[9.5px] text-text-5">{label}</div>
    </div>
  );
}
