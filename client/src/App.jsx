import { useEffect, useState } from 'react';
import { api, setCsrf } from '@/lib/api';
import Login from '@/pages/Login';

/**
 * Shell.
 *
 * Boot resolves who is signed in before anything renders, so the login screen
 * never flashes for a user who already has a session — and the CSRF token is
 * in memory before the first mutating request needs it.
 */
export default function App() {
  const [state, setState] = useState({ loading: true, user: null });

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

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="display text-[30px] font-semibold">سلام {state.user.name}</h1>
        <p className="text-sm text-text-3">
          ورود انجام شد. صفحه‌های بعدی — تحلیل تازه، تاریخچه، داشبورد — در نوبت انتقال‌اند.
        </p>
      </div>
    </div>
  );
}
