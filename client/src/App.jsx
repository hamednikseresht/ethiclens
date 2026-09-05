import { lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, Navigate } from 'react-router-dom';
import { api, setCsrf } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import Login from '@/pages/Login';
import Analyze from '@/pages/Analyze';
import Result from '@/pages/Result';
import History from '@/pages/History';
import Explore from '@/pages/Explore';
import Settings from '@/pages/Settings';
import Dashboard from '@/pages/Dashboard';
import Verify from '@/pages/Verify';
import { LazyRoute } from '@/components/LazyRoute';
import { PageViews } from '@/lib/analytics';

/**
 * The admin panel is fetched on demand.
 *
 * It is eleven sections of forms and tables that only an admin ever opens,
 * and bundling it with everything else meant every ordinary user downloaded
 * all of it to reach the analysis page. Each section is its own chunk, so
 * opening one section does not pull the other ten either.
 */
// The encyclopedia is the largest single page in the app and one tab of
// five reaches it, so it travels in its own chunk too.
const Guide           = lazy(() => import('@/pages/Guide'));

const AdminLayout     = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminOverview   = lazy(() => import('@/pages/admin/Overview'));
const AdminAi         = lazy(() => import('@/pages/admin/Ai'));
const AdminPrompts    = lazy(() => import('@/pages/admin/Prompts'));
const AdminUsers      = lazy(() => import('@/pages/admin/Users'));
const AdminTiers      = lazy(() => import('@/pages/admin/Tiers'));
const AdminAnalyses   = lazy(() => import('@/pages/admin/Analyses'));
const AdminMail       = lazy(() => import('@/pages/admin/Mail'));
const AdminCategories = lazy(() => import('@/pages/admin/Categories'));
const AdminGuide      = lazy(() => import('@/pages/admin/GuideAdmin'));
const AdminSite       = lazy(() => import('@/pages/admin/Site'));
const AdminAudit      = lazy(() => import('@/pages/admin/Audit'));

/**
 * Shell and routing.
 *
 * No basename: the application is served from the domain root now. The pages
 * that stay server-rendered — the landing page, the encyclopedia, the
 * published analyses — have their own addresses and never reach the router.
 */
export default function App() {
  const [state, setState] = useState({ loading: true, user: null });
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    api.get('/api/auth/me')
      .then(d => { setCsrf(d.csrf); setState({ loading: false, user: d.user || null }); })
      .catch(() => setState({ loading: false, user: null }));
  }, []);

  // Schools and gates carry the names and colours every result needs, and
  // they never change between analyses — fetched once for the session.
  useEffect(() => {
    if (state.user?.status === 'active') api.get('/api/analyze/meta').then(setMeta).catch(() => {});
  }, [state.user]);

  const signIn = (user) => setState({ loading: false, user });

  if (state.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <span className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  /**
   * One route sits outside the sign-in gate.
   *
   * A verification link arrives in a mailbox, which may well be opened on a
   * device that has never signed in — so /verify has to answer before the
   * gate, or the link lands on a login form and the token is never spent.
   * Checked here rather than as a route because the gate below returns
   * before any router exists.
   */
  if (location.pathname === '/verify') {
    return (
      <BrowserRouter>
        <PageViews />
        <Routes>
          <Route path="/verify" element={<Verify onSignedIn={signIn} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (!state.user) {
    return <Login onSignedIn={signIn} />;
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

  return (
    <BrowserRouter>
      <PageViews />
      <AppShell user={state.user} onSignedOut={() => setState({ loading: false, user: null })}>
        <Routes>
          <Route path="/" element={<AnalyzeOrResult meta={meta} />} />
          <Route path="/history" element={<History />} />
          <Route path="/guide" element={<LazyRoute><Guide /></LazyRoute>} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/dashboard" element={<Dashboard user={state.user} />} />
          <Route path="/settings" element={
            <Settings user={state.user}
                      onUserChanged={(user) => setState(s => ({ ...s, user }))} />
          } />
          {/* Nested so every section is its own address: /admin/users is a
              link one admin can send another, and each section fetches only
              when it is opened rather than all eleven on arrival. */}
          <Route path="/admin" element={
            <LazyRoute><AdminLayout user={state.user} /></LazyRoute>
          }>
            <Route index element={<AdminOverview />} />
            <Route path="ai" element={<AdminAi />} />
            <Route path="prompts" element={<AdminPrompts />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="tiers" element={<AdminTiers />} />
            <Route path="analyses" element={<AdminAnalyses />} />
            <Route path="mail" element={<AdminMail />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="guide" element={<AdminGuide />} />
            <Route path="site" element={<AdminSite />} />
            <Route path="audit" element={<AdminAudit />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

/**
 * One route, two screens. A stored analysis opens as ?id=, so history can
 * link to it and a reload keeps the same analysis open.
 */
function AnalyzeOrResult({ meta }) {
  const [params, setParams] = useSearchParams();
  const id = params.get('id');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!id) { setResult(null); return; }
    let alive = true;
    api.get(`/api/history/${id}`).then(a => { if (alive) setResult(a); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  const clear = () => { setResult(null); setParams({}, { replace: true }); };

  // The actions on the result page each change one part of this row. Merging
  // their patch here keeps the star, the published badge and the reflection in
  // step without refetching and re-rendering a twenty-six-section document.
  const patch = (fields) => setResult(r => (r ? { ...r, ...fields } : r));

  if (id && result) {
    return <Result analysis={result} meta={meta} onNew={clear} onUpdated={patch} />;
  }
  if (id) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <span className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }
  return <Analyze onDone={(r) => setParams({ id: String(r.analysisId) })} />;
}

