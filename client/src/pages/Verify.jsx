import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Check, TriangleAlert, Hourglass, Link2Off } from 'lucide-react';

/**
 * The page an email verification link lands on.
 *
 * Reachable signed out, which is the whole point: the link arrives in a
 * mailbox that may be opened on a device the person has never signed in on.
 * Verifying also signs them in, so the screen it hands them differs depending
 * on whether that worked.
 *
 * The token may be spent exactly once, and this is the one place in the app
 * where that matters more than anywhere else.
 *
 * The guard has to live outside React. StrictMode mounts every component
 * twice in development, and a flag held in the effect — or in a ref — is
 * created fresh for each mount, so both copies fire. Verifying regenerates
 * the session, which rotates the CSRF token, so the second request came back
 * "توکن امنیتی نامعتبر" and its failure replaced the first one's success:
 * the account was verified and signed in while the screen said the link was
 * invalid. A module-level set is the only thing both mounts share.
 */
const spent = new Set();

export default function Verify({ onSignedIn }) {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [result, setResult] = useState(null);   // null while working

  useEffect(() => {
    if (!token) {
      setResult({ state: 'missing' });
      return;
    }
    if (spent.has(token)) return;
    spent.add(token);

    (async () => {
      try {
        const r = await api.post('/api/auth/verify', { token });
        setResult({ state: 'ok', signedIn: r.signedIn });
        if (r.signedIn && r.user) onSignedIn?.(r.user);
      } catch (e) {
        const stale = e.body?.reason === 'expired' || e.body?.reason === 'used';
        setResult({ state: stale ? 'stale' : 'invalid', message: e.message });
      }
    })();
  }, [token, onSignedIn]);

  return (
    <div className="grid min-h-screen place-items-center bg-background p-5">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            EL
          </span>
          <span className="text-lg font-bold">دیدگاه اخلاق</span>
        </div>

        {!result ? (
          <>
            <span className="mx-auto mb-4 block size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="text-sm text-text-3">در حال بررسی پیوند…</p>
          </>
        ) : (
          <Outcome result={result} />
        )}
      </div>
    </div>
  );
}

function Outcome({ result }) {
  if (result.state === 'ok') {
    return (
      <Panel icon={Check} tone="ok" title="ایمیل شما تأیید شد">
        <p className="mb-5 text-justify text-[13px] leading-loose text-text-3">
          {result.signedIn
            ? 'وارد شده‌اید و می‌توانید همین حالا اولین دوراهی‌تان را تحلیل کنید.'
            : 'حسابتان تأیید شد. برای ادامه وارد شوید.'}
        </p>
        <Button variant="primary" asChild className="w-full">
          <Link to="/">{result.signedIn ? 'شروع تحلیل' : 'ورود به حساب'}</Link>
        </Button>
      </Panel>
    );
  }

  if (result.state === 'missing') {
    return (
      <Panel icon={Link2Off} tone="warn" title="پیوند تأیید ناقص است">
        <p className="mb-5 text-justify text-[13px] leading-loose text-text-3">
          نشانی را کامل از ایمیل کپی کنید، یا از تنظیمات حسابتان پیوند تازه بخواهید.
        </p>
        <Button variant="outline" asChild className="w-full">
          <Link to="/">ورود به حساب</Link>
        </Button>
      </Panel>
    );
  }

  const stale = result.state === 'stale';
  return (
    <Panel icon={stale ? Hourglass : TriangleAlert} tone={stale ? 'warn' : 'danger'}
           title={stale ? 'این پیوند دیگر معتبر نیست' : 'پیوند تأیید معتبر نیست'}>
      <p className="mb-5 text-justify text-[13px] leading-loose text-text-3">{result.message}</p>
      <Button variant="primary" asChild className="w-full">
        <Link to="/settings">ورود و درخواست پیوند تازه</Link>
      </Button>
    </Panel>
  );
}

function Panel({ icon: Icon, tone, title, children }) {
  const tones = {
    ok:     'border-ok/30 bg-ok-soft text-ok',
    warn:   'border-warn/30 bg-warn-soft text-warn',
    danger: 'border-destructive/30 bg-destructive-soft text-destructive'
  };
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <span className={`mx-auto mb-3 grid size-11 place-items-center rounded-full border ${tones[tone]}`}>
        <Icon className="size-5" />
      </span>
      <h1 className="mb-2 text-base font-bold leading-relaxed">{title}</h1>
      {children}
    </div>
  );
}
