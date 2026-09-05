import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, Navigate } from 'react-router-dom';
import { api, setCsrf } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import Login from '@/pages/Login';
import Analyze from '@/pages/Analyze';
import Result from '@/pages/Result';
import History from '@/pages/History';
import Explore from '@/pages/Explore';
import Guide from '@/pages/Guide';
import Settings from '@/pages/Settings';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminOverview from '@/pages/admin/Overview';
import AdminAi from '@/pages/admin/Ai';
import AdminPrompts from '@/pages/admin/Prompts';
import AdminUsers from '@/pages/admin/Users';
import AdminTiers from '@/pages/admin/Tiers';
import AdminAnalyses from '@/pages/admin/Analyses';
import AdminMail from '@/pages/admin/Mail';
import AdminCategories from '@/pages/admin/Categories';
import AdminGuide from '@/pages/admin/GuideAdmin';
import AdminSite from '@/pages/admin/Site';
import AdminAudit from '@/pages/admin/Audit';

/**
 * Shell and routing.
 *
 * basename is /v2 because the bundle is served from there while the current
 * product still owns the root. Without it every route would resolve one level
 * up and land on the old pages.
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

  return (
    <BrowserRouter basename="/v2">
      <AppShell user={state.user} onSignedOut={() => setState({ loading: false, user: null })}>
        <Routes>
          <Route path="/" element={<AnalyzeOrResult meta={meta} />} />
          <Route path="/history" element={<History />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/settings" element={
            <Settings user={state.user}
                      onUserChanged={(user) => setState(s => ({ ...s, user }))} />
          } />
          {/* Nested so every section is its own address: /admin/users is a
              link one admin can send another, and each section fetches only
              when it is opened rather than all eleven on arrival. */}
          <Route path="/admin" element={<AdminLayout user={state.user} />}>
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

  if (id && result) return <Result analysis={result} meta={meta} onNew={clear} />;
  if (id) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <span className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }
  return <Analyze onDone={(r) => setParams({ id: String(r.analysisId) })} />;
}

