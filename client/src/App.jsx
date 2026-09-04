import { useEffect, useState } from 'react';
import { api, setCsrf } from '@/lib/api';
import Login from '@/pages/Login';
import Analyze from '@/pages/Analyze';
import { fa } from '@/lib/fa';

/**
 * Shell.
 *
 * Boot resolves who is signed in before anything renders, so the login screen
 * never flashes for a user who already has a session — and the CSRF token is
 * in memory before the first mutating request needs it.
 */
export default function App() {
  const [state, setState] = useState({ loading: true, user: null });
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/api/auth/me')
      .then(d => { setCsrf(d.csrf); setState({ loading: false, user: d.user || null }); })
      .catch(() => setState({ loading: false, user: null }));
  }, []);

  if (state.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <span className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!state.user) {
    return <Login onSignedIn={(user) => setState({ loading: false, user })} />;
  }

  // The approval gate is the server's rule, mirrored here so a pending user
  // sees why rather than a screen whose every action returns 403.
  if (state.user.status !== 'active') {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-5">
        <div className="max-w-sm space-y-3 text-center">
          <h1 className="display text-[28px] font-semibold">در انتظار تأیید</h1>
          <p className="text-sm leading-loose text-text-3">
            حساب شما ساخته شده و پس از تأیید مدیر می‌توانید تحلیل کنید.
          </p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-5 py-8">
        <h1 className="display text-[28px] font-semibold">تحلیل آماده شد</h1>
        <p className="text-sm text-text-3">
          نمایش نتیجه در نوبت انتقال است. تحلیل با شناسه
          <span className="nums font-bold"> {fa(result.analysisId)} </span>
          ذخیره شد.
        </p>
        <button className="text-sm font-bold text-primary" onClick={() => setResult(null)}>
          تحلیل تازه
        </button>
      </div>
    );
  }

  return <Analyze onDone={setResult} />;
}
