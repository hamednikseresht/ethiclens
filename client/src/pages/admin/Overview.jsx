import { useResource, Panel, Skeleton, Status, Pill } from './ui';
import { fa, faCount, faDuration } from '@/lib/fa';
import { Link } from 'react-router-dom';

/**
 * The state of the system on one screen.
 *
 * Ordered by what would ruin the day: whether the model configuration is
 * usable at all, then people waiting on a decision, then volume. Charts of
 * throughput are further down because a working default model matters more
 * than last week's shape.
 */
export default function Overview() {
  const { data, error, loading } = useResource('/api/admin/overview');

  if (error) return <Status error={error} />;
  if (loading || !data) return <Skeleton rows={4} />;

  const { users, analyses, daily, byModel, topUsers, providers, activeModels, defaultOk, mailConfigured } = data;

  return (
    <div className="space-y-3">
      <Health defaultOk={defaultOk} activeModels={activeModels}
              mailConfigured={mailConfigured} pending={users.pending} />

      <Panel title="کاربران">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="کل" value={users.total} />
          <Stat label="مدیر" value={users.admins} />
          <Stat label="هفته اخیر" value={users.newWeek} />
          <Stat label="در انتظار" value={users.pending} tone={users.pending ? 'warn' : undefined} />
          <Stat label="معلق" value={users.suspended} />
          <Stat label="ردشده" value={users.rejected} />
        </div>
        {users.suspectEmail > 0 && (
          <p className="mt-3 text-[11.5px] text-warn">
            {fa(users.suspectEmail)} کاربر با ایمیل مشکوک ثبت شده است.
          </p>
        )}
      </Panel>

      <Panel title="تحلیل‌ها">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="کل" value={analyses.total} />
          <Stat label="موفق" value={analyses.done} />
          <Stat label="ناموفق" value={analyses.failed} tone={analyses.failed ? 'danger' : undefined} />
          <Stat label="امروز" value={analyses.today} />
          <Stat label="میانگین زمان" text={faDuration((analyses.avgMs || 0) / 1000)} />
          <Stat label="توکن" text={faCount(analyses.tokensIn + analyses.tokensOut)} />
        </div>
      </Panel>

      {daily.length > 0 && <Activity daily={daily} />}

      <Panel title="ارائه‌دهندگان">
        <ul className="space-y-1.5">
          {providers.map(p => (
            <li key={p.key} className="flex items-center gap-2 text-[12.5px]">
              <span className="grow font-bold">{p.label}</span>
              {!p.hasKey && <Pill tone="danger">بدون کلید</Pill>}
              <Pill tone={p.enabled ? 'ok' : undefined}>{p.enabled ? 'فعال' : 'خاموش'}</Pill>
              <span className="nums w-16 text-end text-[11px] text-text-4">{fa(p.models)} مدل</span>
            </li>
          ))}
        </ul>
      </Panel>

      {byModel.length > 0 && (
        <Panel title="مصرف بر اساس مدل">
          <ul className="space-y-1.5">
            {byModel.slice(0, 8).map(m => (
              <li key={m.model} className="flex items-baseline gap-2 text-[12px]">
                <span className="ltr grow truncate text-text-2">{m.model || '—'}</span>
                <span className="nums text-text-4">{fa(m.c)}</span>
                <span className="nums w-14 text-end text-[11px] text-text-5">
                  {faDuration((m.avgMs || 0) / 1000)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {topUsers.length > 0 && (
        <Panel title="پرکارترین کاربران">
          <ul className="space-y-1.5">
            {topUsers.map(u => (
              <li key={u.id} className="flex items-baseline gap-2 text-[12px]">
                <span className="grow truncate">{u.name || u.email}</span>
                <span className="nums text-text-4">{fa(u.c)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/**
 * The things that stop the product working, said first and in plain words.
 *
 * A missing default model is not a statistic — it means every analysis fails
 * — so it gets a line of its own rather than a number in a grid.
 */
function Health({ defaultOk, activeModels, mailConfigured, pending }) {
  const problems = [
    !defaultOk && { tone: 'danger', text: 'مدل پیش‌فرض تنظیم نشده یا در دسترس نیست؛ تحلیل کار نمی‌کند.', to: 'site' },
    !activeModels && { tone: 'danger', text: 'هیچ مدل فعالی وجود ندارد.', to: 'ai' },
    !mailConfigured && { tone: 'warn', text: 'سرویس ایمیل تنظیم نشده؛ تأیید حساب و بازیابی رمز کار نمی‌کند.', to: 'mail' },
    pending > 0 && { tone: 'warn', text: `${fa(pending)} کاربر منتظر تأیید است.`, to: 'users' }
  ].filter(Boolean);

  if (!problems.length) {
    return (
      <Panel>
        <p className="flex items-center gap-2 text-[13px] font-bold text-ok">
          همه‌چیز سرِ جایش است.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="نیازمند رسیدگی">
      <ul className="space-y-2">
        {problems.map((p, i) => (
          <li key={i}>
            <Link to={p.to}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 text-[12.5px] leading-relaxed ${
                    p.tone === 'danger'
                      ? 'border-destructive/30 bg-destructive-soft text-destructive'
                      : 'border-warn/30 bg-warn-soft text-warn'}`}>
              {p.text}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Thirty days of volume as bars.
 *
 * Days with no analyses are absent from the query, not zero, so the series is
 * rebuilt across every date in the window — otherwise a quiet week silently
 * compresses and the chart reads as continuous activity.
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
    <Panel title="فعالیت ۳۰ روز اخیر" hint={`${fa(total)} تحلیل در این بازه.`}>
      <div dir="ltr" className="flex h-20 items-end gap-[2px]">
        {days.map(d => (
          <div key={d.key} className="flex-1 rounded-t-sm bg-primary/80"
               style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }}
               title={`${d.key}: ${d.count}`} />
        ))}
      </div>
      <div dir="ltr" className="mt-1.5 flex justify-between text-[10px] text-text-5">
        <span>{days[0].key}</span>
        <span>{days[days.length - 1].key}</span>
      </div>
    </Panel>
  );
}

function Stat({ label, value, text, tone }) {
  const tones = { warn: 'text-warn', danger: 'text-destructive' };
  return (
    <div className="rounded-lg bg-subtle p-2.5 text-center">
      <div className={`nums text-[17px] font-bold ${tones[tone] || ''}`}>
        {text ?? fa(value ?? 0)}
      </div>
      <div className="mt-0.5 text-[10px] text-text-5">{label}</div>
    </div>
  );
}
