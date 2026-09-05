import { useState } from 'react';
import { useResource, Panel, Status, Skeleton, Empty } from './ui';
import { Input } from '@/components/ui/input';
import { fa } from '@/lib/fa';
import { Search } from 'lucide-react';

/**
 * The audit log.
 *
 * Filtered in the browser rather than on the server: the endpoint returns the
 * last two hundred events and that is already the whole set worth scanning —
 * a round trip per keystroke would buy nothing.
 */

/** Actions worth naming in Persian. Anything else shows its raw key. */
const ACTIONS = {
  user_approve: 'تأیید کاربر',
  user_reject: 'رد کاربر',
  user_update: 'ویرایش کاربر',
  user_delete: 'حذف کاربر',
  user_reset_password: 'تغییر رمز کاربر',
  user_verify_email: 'تأیید دستی ایمیل',
  email_check: 'بررسی ایمیل',
  settings_update: 'تغییر تنظیمات',
  provider_add: 'افزودن ارائه‌دهنده',
  provider_update: 'ویرایش ارائه‌دهنده',
  provider_delete: 'حذف ارائه‌دهنده',
  model_add: 'افزودن مدل',
  model_delete: 'حذف مدل',
  models_probe: 'آزمایش مدل‌ها',
  prompt_create: 'ساخت دستور',
  prompt_update: 'ویرایش دستور',
  prompt_activate: 'فعال‌سازی دستور',
  guide_update: 'ویرایش دانشنامه',
  guide_create: 'ساخت بخش دانشنامه',
  guide_delete: 'حذف بخش دانشنامه',
  guide_reset: 'بازگردانی بخش دانشنامه',
  category_create: 'ساخت دسته‌بندی',
  category_update: 'ویرایش دسته‌بندی',
  category_delete: 'حذف دسته‌بندی',
  mail_test: 'ایمیل آزمایشی',
  verify_resend: 'ارسال دوباره تأیید'
};

export default function Audit() {
  const { data, error, loading } = useResource('/api/admin/audit');
  const [q, setQ] = useState('');

  if (error) return <Status error={error} />;
  if (loading || !data) return <Skeleton rows={5} />;

  const needle = q.trim().toLowerCase();
  const items = needle
    ? data.items.filter(e =>
        [e.action, ACTIONS[e.action], e.email, e.detail, e.ip]
          .some(v => String(v || '').toLowerCase().includes(needle)))
    : data.items;

  return (
    <Panel title="گزارش رخدادها" hint={`${fa(data.items.length)} رخداد اخیر.`}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-text-5" />
        <Input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="جست‌وجو در رخدادها" className="pe-10" />
      </div>

      {!items.length ? (
        <Empty>رخدادی با این شرایط نیست.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {items.map((e, i) => <Event key={`${e.created_at}-${i}`} event={e} />)}
        </ul>
      )}
    </Panel>
  );
}

function Event({ event }) {
  const [open, setOpen] = useState(false);
  const detail = parse(event.detail);

  return (
    <li className="rounded-lg border border-border p-2.5">
      <button onClick={() => setOpen(o => !o)} disabled={!detail}
              className="flex w-full items-baseline gap-2 text-start">
        <span className="grow text-[12px] font-bold">
          {ACTIONS[event.action] || event.action}
        </span>
        <span className="ltr shrink-0 text-[10px] text-text-5">{stamp(event.created_at)}</span>
      </button>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] text-text-5">
        {event.email && <span className="ltr">{event.email}</span>}
        {event.ip && <span className="ltr">· {event.ip}</span>}
      </div>

      {open && detail && (
        <pre dir="ltr" className="mt-2 overflow-x-auto rounded bg-subtle p-2 font-mono text-[10.5px]">
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </li>
  );
}

/** Stored as JSON text; older rows can hold a bare string or nothing. */
function parse(raw) {
  if (!raw) return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return v && typeof v === 'object' ? v : { value: v };
  } catch { return { value: String(raw) }; }
}

/**
 * Timestamps stay Latin here on purpose. This is a forensic list read in
 * sequence, and Persian numerals make two adjacent times harder to compare
 * at a glance than they are worth.
 */
function stamp(sqlDate) {
  if (!sqlDate) return '';
  return String(sqlDate).replace('T', ' ').slice(0, 16);
}
