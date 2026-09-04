import { useEffect, useState } from 'react';
import { api, setCsrf } from '@/lib/api';
import Login from '@/pages/Login';
import Analyze from '@/pages/Analyze';
import Result from '@/pages/Result';

/**
 * Shell.
 *
 * Boot resolves who is signed in before anything renders, so the login screen
 * never flashes for a user who already has a session — and the CSRF token is
 * in memory before the first mutating request needs it.
 */
export default function App() {
  const [state, setState] = useState({ loading: true, user: null });
  const [meta, setMeta] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/api/auth/me')
      .then(d => { setCsrf(d.csrf); setState({ loading: false, user: d.user || null }); })
      .catch(() => setState({ loading: false, user: null }));
  }, []);

  // Schools and gates carry the names and colours the result view needs, and
  // they are the same for every analysis — fetched once here rather than on
  // each result.
  useEffect(() => {
    if (state.user?.status === 'active') api.get('/api/analyze/meta').then(setMeta).catch(() => {});
  }, [state.user]);

  // A stored analysis opens by id, so history can link to one and a shared
  // link still resolves. The id lives in the query string rather than React
  // state alone, or reloading the page would lose which analysis was open.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (!id || result || state.user?.status !== 'active') return;
    api.get(`/api/history/${id}`)
      .then(setResult)
      .catch(() => {});
  }, [state.user]);

  const clearResult = () => {
    setResult(null);
    if (location.search) history.replaceState(null, '', location.pathname);
  };

  if (state.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <span className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!state.user) return <Login onSignedIn={(user) => setState({ loading: false, user })} />;

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
    return <Result analysis={result} meta={meta} onNew={clearResult} />;
  }

  return <Analyze onDone={setResult} />;
}
