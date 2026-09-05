import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { fa, faCount, faDate } from '@/lib/fa';
import { getTheme, applyTheme } from '@/lib/theme';
import { watchInstallPrompt, isStandalone, isIosSafari } from '@/lib/pwa';
import {
  User, KeyRound, Gauge, Palette, Download, BadgeCheck, MailWarning, Check
} from 'lucide-react';

/**
 * Account settings.
 *
 * Each block owns its own saving state and its own message. A single form
 * with one save button would mean a failed password change discarding an
 * edited name, and the two have nothing to do with each other.
 */
export default function Settings({ user, onUserChanged }) {
  const [allowance, setAllowance] = useState(null);
  const [verification, setVerification] = useState(null);

  useEffect(() => {
    api.get('/api/auth/me').then(d => setAllowance(d.allowance)).catch(() => {});
    api.get('/api/auth/verification').then(setVerification).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-xl px-5 pb-6 pt-6">
      <h1 className="display mb-5 text-[30px] font-semibold leading-tight">تنظیمات حساب</h1>

      <div className="space-y-3">
        <ProfileCard user={user} onUserChanged={onUserChanged} />
        <EmailCard user={user} verification={verification} onChanged={setVerification} />
        <PasswordCard />
        <UsageCard allowance={allowance} />
        <AppearanceCard />
        <InstallCard />
        <AccountCard user={user} />
      </div>
    </div>
  );
}

/* ==========================================================================
   Blocks
   ========================================================================== */

function ProfileCard({ user, onUserChanged }) {
  const [name, setName] = useState(user?.name || '');
  const [state, setState] = useState({ busy: false, msg: '', error: '' });
  const dirty = name.trim() !== (user?.name || '').trim();

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, msg: '', error: '' });
    try {
      const r = await api.post('/api/auth/profile', { name: name.trim() });
      setState({ busy: false, msg: 'ذخیره شد.', error: '' });
      onUserChanged?.({ ...user, name: r.name });
    } catch (err) {
      setState({ busy: false, msg: '', error: err.message });
    }
  };

  return (
    <Card icon={User} title="مشخصات">
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label htmlFor="s-name">نام</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)}
                 autoComplete="name" minLength={2} required />
        </div>
        <Status msg={state.msg} error={state.error} />
        <Button type="submit" variant="primary" size="sm" disabled={state.busy || !dirty}>
          {state.busy ? 'در حال ذخیره…' : 'ذخیره'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Email and its verification.
 *
 * The address itself is not editable here: changing it has to re-verify, and
 * a field that silently does nothing is worse than no field. The state that
 * matters — verified or not — is what this block shows.
 */
function EmailCard({ user, verification, onChanged }) {
  const [state, setState] = useState({ busy: false, msg: '', error: '' });
  const [wait, setWait] = useState(0);

  useEffect(() => { setWait(verification?.resendInSeconds || 0); }, [verification]);

  // Counts the throttle down so the button says when it will work again
  // instead of failing with a 429 the moment someone taps it.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = async () => {
    setState({ busy: true, msg: '', error: '' });
    try {
      const r = await api.post('/api/auth/resend-verification');
      setState({ busy: false, msg: 'ایمیل تأیید فرستاده شد.', error: '' });
      setWait(r.resendInSeconds || 60);
      onChanged?.({ ...verification, resendInSeconds: r.resendInSeconds || 60 });
    } catch (err) {
      setState({ busy: false, msg: '', error: err.message });
    }
  };

  const verified = verification ? verification.verified : user?.emailVerified;

  return (
    <Card icon={verified ? BadgeCheck : MailWarning} title="ایمیل"
          tone={verified ? 'ok' : 'warn'}>
      <p className="ltr mb-2 text-[13px] font-bold">{user?.email}</p>

      {verified ? (
        <p className="text-[12px] text-ok">این ایمیل تأیید شده است.</p>
      ) : (
        <>
          {/* This used to add "you cannot run an analysis until you verify"
              when a setting said verification was required. Nothing enforced
              it, so the sentence was simply untrue. */}
          <p className="mb-3 text-justify text-[12.5px] leading-loose text-text-3">
            ایمیل شما هنوز تأیید نشده است. تأیید آن باعث می‌شود بازیابی رمز و
            اطلاع‌رسانی‌ها به دستتان برسد.
          </p>
          {verification && !verification.mailEnabled ? (
            <p className="text-[12px] text-text-4">
              سرویس ایمیل تنظیم نشده است؛ برای تأیید با مدیر سامانه تماس بگیرید.
            </p>
          ) : (
            <>
              <Status msg={state.msg} error={state.error} />
              <Button variant="outline" size="sm" onClick={resend}
                      disabled={state.busy || wait > 0}>
                {wait > 0 ? `${fa(wait)} ثانیه تا ارسال دوباره`
                          : state.busy ? 'در حال ارسال…' : 'ارسال دوباره ایمیل تأیید'}
              </Button>
            </>
          )}
        </>
      )}
    </Card>
  );
}

function PasswordCard() {
  const [f, setF] = useState({ current: '', next: '', repeat: '' });
  const [state, setState] = useState({ busy: false, msg: '', error: '' });

  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    // Checked here as well as on the server: the server never sees `repeat`,
    // so a mismatch would otherwise change the password to the first value.
    if (f.next !== f.repeat) {
      return setState({ busy: false, msg: '', error: 'رمز جدید و تکرارش یکی نیستند.' });
    }
    setState({ busy: true, msg: '', error: '' });
    try {
      await api.post('/api/auth/change-password', { current: f.current, next: f.next });
      setF({ current: '', next: '', repeat: '' });
      setState({ busy: false, msg: 'رمز عبور عوض شد.', error: '' });
    } catch (err) {
      setState({ busy: false, msg: '', error: err.message });
    }
  };

  return (
    <Card icon={KeyRound} title="تغییر رمز عبور">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="s-cur">رمز فعلی</Label>
          <Input id="s-cur" type="password" value={f.current} onChange={set('current')}
                 autoComplete="current-password" required />
        </div>
        <div>
          <Label htmlFor="s-new">رمز جدید</Label>
          <Input id="s-new" type="password" value={f.next} onChange={set('next')}
                 autoComplete="new-password" minLength={8} required />
          <p className="mt-1 text-[11px] text-text-5">دست‌کم ۸ نویسه.</p>
        </div>
        <div>
          <Label htmlFor="s-rep">تکرار رمز جدید</Label>
          <Input id="s-rep" type="password" value={f.repeat} onChange={set('repeat')}
                 autoComplete="new-password" minLength={8} required />
        </div>
        <Status msg={state.msg} error={state.error} />
        <Button type="submit" variant="primary" size="sm" disabled={state.busy}>
          {state.busy ? 'در حال تغییر…' : 'تغییر رمز'}
        </Button>
      </form>
    </Card>
  );
}

function UsageCard({ allowance }) {
  if (!allowance) {
    return <Card icon={Gauge} title="سهمیه"><div className="h-12 animate-pulse rounded-lg bg-muted" /></Card>;
  }

  const { tier, daily, tokens } = allowance;

  return (
    <Card icon={Gauge} title="سهمیه و مصرف">
      <p className="mb-3 text-[12px] text-text-4">
        سطح حساب: <span className="font-bold text-text-2">{tier.label}</span>
      </p>

      <Meter label="تحلیل امروز"
             used={daily.used}
             limit={daily.limit}
             remaining={daily.remaining} />

      <Meter label="توکن این ماه"
             used={tokens.used}
             limit={tokens.limit}
             remaining={tokens.remaining}
             percent={tokens.percent}
             format={faCount} />

      {tokens.totalAllTime > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-[11px] text-text-5">
          مجموع از ابتدا: <span className="nums">{faCount(tokens.totalAllTime)}</span> توکن
        </p>
      )}
    </Card>
  );
}

/**
 * One usage bar. A limit of 0 means unlimited in this product, which has to
 * be said in words — a bar drawn against no ceiling is either always empty or
 * always full, and both are lies.
 */
function Meter({ label, used, limit, remaining, percent, format = fa }) {
  const unlimited = !limit || limit <= 0;
  const pct = unlimited ? 0 : (percent ?? Math.min(100, Math.round((used / limit) * 100)));
  const tone = pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warn' : 'bg-primary';

  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold">{label}</span>
        <span className="nums text-[11px] text-text-4">
          {unlimited
            ? <>{format(used)} — بی‌نهایت</>
            : <>{format(used)} از {format(limit)}</>}
        </span>
      </div>
      {!unlimited && (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full transition-[width] ${tone}`} style={{ width: `${pct}%` }} />
          </div>
          {remaining !== null && remaining !== undefined && (
            <p className="mt-1 text-[10.5px] text-text-5">
              <span className="nums">{format(remaining)}</span> باقی مانده
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AppearanceCard() {
  const [theme, setTheme] = useState(getTheme);

  const pick = (t) => { setTheme(applyTheme(t)); };

  const options = [
    ['system', 'خودکار'],
    ['light', 'روشن'],
    ['dark', 'تیره']
  ];

  return (
    <Card icon={Palette} title="ظاهر">
      <div className="flex gap-1.5">
        {options.map(([k, label]) => (
          <button key={k} onClick={() => pick(k)}
                  aria-pressed={theme === k}
                  className={`flex-1 rounded-lg border px-3 py-2 text-[12px] font-bold transition-colors ${
                    theme === k ? 'border-primary bg-primary-soft text-primary'
                                : 'border-border bg-card text-text-4'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-text-5">
        «خودکار» از تنظیم خودِ گوشی پیروی می‌کند.
      </p>
    </Card>
  );
}

/**
 * Installing to the home screen.
 *
 * The card only appears once the browser has offered the prompt. Showing an
 * install button that cannot install — because the app is already installed,
 * or the browser does not support it, or it is iOS, which never fires this
 * event — is a button that does nothing when tapped.
 */
function InstallCard() {
  const [prompt, setPrompt] = useState(null);
  const [outcome, setOutcome] = useState('');

  // Wrapped in an arrow: what arrives is itself a function, and passing one
  // straight to a setter makes React call it as a state updater instead of
  // storing it.
  useEffect(() => watchInstallPrompt(fn => setPrompt(() => fn)), []);

  // Already installed — there is nothing to offer.
  if (isStandalone() || outcome === 'accepted') return null;

  const blurb = (
    <p className="mb-3 text-justify text-[12.5px] leading-loose text-text-3">
      دیدگاه اخلاق را مثل یک برنامه روی صفحه اصلی نصب کنید تا سریع‌تر باز شود
      و نوار مرورگر را نگیرد.
    </p>
  );

  // iOS installs apps but never offers the event, so the only thing that can
  // be shown there is the manual route. Saying nothing would make the feature
  // look missing on iPhone rather than manual.
  if (!prompt) {
    if (!isIosSafari()) return null;
    return (
      <Card icon={Download} title="نصب روی گوشی">
        {blurb}
        <ol className="space-y-1.5 text-[12.5px] leading-loose text-text-2">
          <li>۱. دکمه هم‌رسانی (Share) را در نوار پایین سافاری بزنید.</li>
          <li>۲. گزینه «Add to Home Screen» را انتخاب کنید.</li>
          <li>۳. روی Add بزنید.</li>
        </ol>
      </Card>
    );
  }

  return (
    <Card icon={Download} title="نصب روی گوشی">
      {blurb}
      <Button variant="primary" size="sm"
              onClick={async () => setOutcome(await prompt())}>
        نصب
      </Button>
      {outcome === 'dismissed' && (
        <p className="mt-2 text-[11px] text-text-5">نصب انجام نشد. هر وقت خواستید دوباره امتحان کنید.</p>
      )}
    </Card>
  );
}

function AccountCard({ user }) {
  const rows = [
    ['نقش', user?.role === 'admin' ? 'مدیر' : 'کاربر'],
    ['وضعیت', user?.status === 'active' ? 'فعال' : user?.status],
    ['تاریخ عضویت', faDate(user?.createdAt)]
  ].filter(([, v]) => v);

  return (
    <Card title="اطلاعات حساب">
      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 text-[12px]">
            <dt className="text-text-4">{k}</dt>
            <dd className="font-bold">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ==========================================================================
   Shared pieces
   ========================================================================== */

function Card({ icon: Icon, title, tone, children }) {
  const tones = { ok: 'text-ok', warn: 'text-warn' };
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
        {Icon && <Icon className={`size-4 ${tones[tone] || 'text-text-4'}`} />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Status({ msg, error }) {
  if (!msg && !error) return null;
  return error
    ? <p className="text-[12px] text-destructive">{error}</p>
    : <p className="flex items-center gap-1 text-[12px] text-ok"><Check className="size-3.5" />{msg}</p>;
}
