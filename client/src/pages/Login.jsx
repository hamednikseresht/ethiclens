import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { CodeInput } from '@/components/CodeInput';
import { RefreshCw, ArrowRight, Mail, ShieldCheck } from 'lucide-react';

/**
 * Sign-in, registration, email code and password reset.
 *
 * One component with a `view` state rather than separate routes, because the
 * flows hand off to each other mid-task — registering can land on the code
 * screen, and a wrong code has to return to it without losing the email. A
 * router would put those hand-offs in the URL, where a refresh or a back
 * button drops the state the next step needs.
 */

const RESEND_SECONDS = 60;

export default function Login({ onSignedIn }) {
  const [view, setView] = useState('login');   // login | register | code | registered | forgot | reset
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Carried across views: the code and reset screens need the address the
  // previous step used, and re-typing it is both friction and a way to get it
  // wrong.
  const [email, setEmail] = useState('');
  const [expiresIn, setExpiresIn] = useState(null);

  const go = (next) => { setError(''); setNotice(''); setView(next); };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
            EL
          </span>
          <h1 className="display text-[30px] font-semibold leading-tight">دیدگاه اخلاق</h1>
          <p className="mt-1 text-xs text-text-4">دوراهی‌ات را از هشت منظر فلسفه اخلاق ببین</p>
        </div>

        <Card>
          <CardContent className="p-5 pt-5">
            {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
            {notice && <Alert variant="ok" className="mb-4">{notice}</Alert>}

            {view === 'login' && (
              <LoginForm
                busy={busy} setBusy={setBusy} setError={setError}
                onSignedIn={onSignedIn}
                onRegister={() => go('register')}
                onForgot={() => go('forgot')}
              />
            )}

            {view === 'register' && (
              <RegisterForm
                busy={busy} setBusy={setBusy} setError={setError}
                onLogin={() => go('login')}
                onDone={(res, addr) => {
                  setEmail(addr);
                  setExpiresIn(res.expiresInMinutes ?? null);
                  if (res.codeSent) { setError(''); setNotice(''); setView('code'); }
                  else { setNotice(res.message); setView('registered'); }
                }}
              />
            )}

            {view === 'code' && (
              <CodeStep
                email={email}
                minutes={expiresIn}
                setError={setError}
                verify={(code) => api.post('/api/auth/verify-code', { code })}
                resend={() => api.post('/api/auth/send-code')}
                onVerified={() => { setNotice('ایمیل شما تأیید شد. حساب پس از تأیید مدیر فعال می‌شود.'); setView('registered'); }}
              />
            )}

            {view === 'registered' && (
              <div className="space-y-4 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
                  <ShieldCheck className="size-6" />
                </span>
                <p className="text-sm leading-loose text-text-2">
                  ثبت‌نام شما انجام شد. حساب پس از <strong>تأیید مدیر</strong> فعال می‌شود
                  و آن‌وقت می‌توانید تحلیل کنید.
                </p>
                <Button variant="outline" className="w-full" onClick={() => go('login')}>
                  بازگشت به ورود
                </Button>
              </div>
            )}

            {view === 'forgot' && (
              <ForgotForm
                busy={busy} setBusy={setBusy} setError={setError}
                onLogin={() => go('login')}
                onSent={(addr, res) => {
                  setEmail(addr);
                  setExpiresIn(res?.expiresInMinutes ?? null);
                  setError(''); setNotice(''); setView('reset');
                }}
              />
            )}

            {view === 'reset' && (
              <ResetForm
                email={email} minutes={expiresIn}
                setError={setError}
                onDone={() => { setNotice('رمز تازه ثبت شد. حالا وارد شوید.'); setView('login'); }}
              />
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-text-5">
          این ابزار جایگزین مشاوره حقوقی، پزشکی یا روان‌شناختی نیست.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Sign in ---------------- */
function LoginForm({ busy, setBusy, setError, onSignedIn, onRegister, onForgot }) {
  const [mail, setMail] = useState('');
  const [pass, setPass] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post('/api/auth/login', { email: mail.trim(), password: pass });
      onSignedIn?.(r.user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="li-email">ایمیل</Label>
        <Input id="li-email" type="email" required autoComplete="email" dir="ltr"
               value={mail} onChange={(e) => setMail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="li-pass">رمز عبور</Label>
        <Input id="li-pass" type="password" required autoComplete="current-password"
               value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>

      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'در حال ورود…' : 'ورود'}
      </Button>

      <div className="flex items-center justify-between pt-1 text-xs">
        <button type="button" onClick={onForgot} className="text-text-4 hover:text-foreground">
          رمزم را فراموش کرده‌ام
        </button>
        <button type="button" onClick={onRegister} className="font-bold text-primary hover:underline">
          ساخت حساب تازه
        </button>
      </div>
    </form>
  );
}

/* ---------------- Register ---------------- */
function RegisterForm({ busy, setBusy, setError, onLogin, onDone }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [mail, setMail] = useState('');
  const [pass, setPass] = useState('');
  const [captcha, setCaptcha] = useState('');

  // Cache-busted so a refused answer can be retried with a genuinely new
  // image; the endpoint sends no-store, but the browser still reuses the URL.
  const [nonce, setNonce] = useState(() => Date.now());
  const reloadCaptcha = () => { setCaptcha(''); setNonce(Date.now()); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const addr = mail.trim();
    try {
      const r = await api.post('/api/auth/register', {
        firstName: first.trim(), lastName: last.trim(),
        email: addr, password: pass, captcha
      });
      onDone(r, addr);
    } catch (err) {
      setError(err.message);
      // The challenge is single-use, so a failed attempt always needs a fresh
      // one — otherwise the next try fails on the CAPTCHA rather than on
      // whatever the user actually got wrong.
      reloadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rg-first">نام <span className="font-normal text-text-5">اختیاری</span></Label>
          <Input id="rg-first" value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rg-last">نام خانوادگی <span className="font-normal text-text-5">اختیاری</span></Label>
          <Input id="rg-last" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rg-email">ایمیل</Label>
        <Input id="rg-email" type="email" required autoComplete="email" dir="ltr"
               value={mail} onChange={(e) => setMail(e.target.value)} placeholder="you@example.com" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rg-pass">رمز عبور</Label>
        <Input id="rg-pass" type="password" required minLength={8} autoComplete="new-password"
               value={pass} onChange={(e) => setPass(e.target.value)} />
        <p className="text-[11px] text-text-5">حداقل ۸ نویسه.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rg-captcha">حاصل را وارد کنید</Label>
        <div className="flex items-center gap-2">
          <img src={`/api/auth/captcha?v=${nonce}`} alt="تصویر امنیتی"
               className="h-11 rounded-md border border-border bg-card" />
          <Button type="button" variant="ghost" size="icon" onClick={reloadCaptcha} title="تصویر تازه">
            <RefreshCw />
          </Button>
          <Input id="rg-captcha" required inputMode="numeric" className="flex-1 nums"
                 value={captcha} onChange={(e) => setCaptcha(e.target.value)} />
        </div>
      </div>

      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'در حال ثبت…' : 'ثبت‌نام'}
      </Button>

      <button type="button" onClick={onLogin}
              className="w-full pt-1 text-xs text-text-4 hover:text-foreground">
        حساب دارید؟ وارد شوید
      </button>
    </form>
  );
}

/* ---------------- Email code ---------------- */
function CodeStep({ email, minutes, setError, verify, resend, onVerified }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const timer = useRef(null);

  useEffect(() => {
    timer.current = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(timer.current);
  }, []);

  const submit = useCallback(async (value) => {
    const entered = value ?? code;
    if (entered.length !== 6 || busy) return;
    setBusy(true); setError('');
    try {
      await verify(entered);
      onVerified();
    } catch (err) {
      setError(err.message);
      setCode('');           // clearing the row is the cue to type it again
    } finally {
      setBusy(false);
    }
  }, [code, busy, verify, onVerified, setError]);

  const again = async () => {
    setError('');
    try { await resend(); setWait(RESEND_SECONDS); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
          <Mail className="size-6" />
        </span>
        <p className="text-sm leading-loose text-text-2">
          کد شش‌رقمی را به <span className="ltr font-bold">{email}</span> فرستادیم.
        </p>
        {minutes && (
          <p className="mt-1 text-[11px] text-text-5">
            کد تا <span className="nums">{minutes}</span> دقیقه معتبر است.
          </p>
        )}
      </div>

      <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={busy} autoFocus />

      <Button variant="primary" className="w-full" disabled={busy || code.length !== 6}
              onClick={() => submit()}>
        {busy ? 'در حال بررسی…' : 'تأیید'}
      </Button>

      <button type="button" onClick={again} disabled={wait > 0}
              className="w-full text-xs text-text-4 hover:text-foreground disabled:opacity-50">
        {wait > 0
          ? <>ارسال دوباره تا <span className="nums">{wait}</span> ثانیه دیگر</>
          : 'کد را دوباره بفرست'}
      </button>
    </div>
  );
}

/* ---------------- Forgot password ---------------- */
function ForgotForm({ busy, setBusy, setError, onLogin, onSent }) {
  const [mail, setMail] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const addr = mail.trim();
    try {
      const r = await api.post('/api/auth/forgot', { email: addr });
      onSent(addr, r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="text-center">
        <p className="text-sm leading-loose text-text-2">
          نشانی ایمیل حسابتان را بنویسید تا کد بازیابی بفرستیم.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fg-email">ایمیل</Label>
        <Input id="fg-email" type="email" required autoComplete="email" dir="ltr"
               value={mail} onChange={(e) => setMail(e.target.value)} placeholder="you@example.com" />
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'در حال ارسال…' : 'ارسال کد'}
      </Button>
      <button type="button" onClick={onLogin}
              className="flex w-full items-center justify-center gap-1 pt-1 text-xs text-text-4 hover:text-foreground">
        <ArrowRight className="size-3.5" /> بازگشت به ورود
      </button>
    </form>
  );
}

/* ---------------- Set a new password ---------------- */
function ResetForm({ email, minutes, setError, onDone }) {
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/reset', { email, code, password: pass });
      onDone();
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-center text-sm leading-loose text-text-2">
        کد فرستاده‌شده به <span className="ltr font-bold">{email}</span> و رمز تازه را وارد کنید.
        {minutes && <span className="block mt-1 text-[11px] text-text-5">
          کد تا <span className="nums">{minutes}</span> دقیقه معتبر است.
        </span>}
      </p>

      <CodeInput value={code} onChange={setCode} disabled={busy} autoFocus />

      <div className="space-y-1.5">
        <Label htmlFor="np">رمز تازه</Label>
        <Input id="np" type="password" required minLength={8} autoComplete="new-password"
               value={pass} onChange={(e) => setPass(e.target.value)} />
        <p className="text-[11px] text-text-5">حداقل ۸ نویسه.</p>
      </div>

      <Button type="submit" variant="primary" className="w-full"
              disabled={busy || code.length !== 6 || pass.length < 8}>
        {busy ? 'در حال ثبت…' : 'ثبت رمز تازه'}
      </Button>
    </form>
  );
}
