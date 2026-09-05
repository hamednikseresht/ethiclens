import { NavLink, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { api } from '@/lib/api';
import { OfflineBar } from '@/components/OfflineBar';
import { Compass, Clock, Globe, BookOpen, X, LogOut, Settings, Shield, LayoutDashboard } from 'lucide-react';

/**
 * The app frame: a header with the account button, and a four-tab bar pinned
 * to the bottom.
 *
 * The bar replaces the old top navigation, which broke on phones — seven
 * links totalling 591px were squeezed into a 24px scroller, leaving four of
 * them unreachable. Four tabs at the bottom sit inside thumb reach and cannot
 * overflow, and everything that is not a primary destination — settings,
 * admin, signing out — moves into a sheet behind the avatar.
 */

const TABS = [
  { to: '/',        label: 'تحلیل تازه', icon: Compass },
  { to: '/history', label: 'تاریخچه',    icon: Clock },
  { to: '/explore', label: 'عمومی',      icon: Globe },
  { to: '/guide',   label: 'دانشنامه',   icon: BookOpen }
];

export function AppShell({ user, children, onSignedOut }) {
  const [sheet, setSheet] = useState(false);
  const { pathname } = useLocation();

  // The result view takes over the screen; a tab bar under it would compete
  // with the analysis for attention.
  const immersive = pathname === '/' && new URLSearchParams(location.search).has('id');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <OfflineBar />
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-5">
          <span className="grid size-8 place-items-center rounded-sm bg-primary text-[11px] font-bold text-primary-foreground">
            EL
          </span>
          <span className="grow font-bold">دیدگاه اخلاق</span>
          <button onClick={() => setSheet(true)}
                  className="grid size-9 place-items-center rounded-full bg-muted text-xs font-bold"
                  aria-label="حساب کاربری">
            {(user?.name || user?.email || '؟')[0]}
          </button>
        </div>
      </header>

      <main className="pb-20">{children}</main>

      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card"
             style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="mx-auto flex max-w-xl">
            {TABS.map(t => (
              <NavLink key={t.to} to={t.to} end={t.to === '/'}
                       className={({ isActive }) =>
                         `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${
                           isActive ? 'text-primary' : 'text-text-5'}`}>
                {({ isActive }) => (
                  <>
                    <t.icon className="size-5" strokeWidth={isActive ? 2.1 : 2} />
                    {t.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      {sheet && <AccountSheet user={user} onClose={() => setSheet(false)} onSignedOut={onSignedOut} />}
    </div>
  );
}

/**
 * Account sheet.
 *
 * A bottom sheet rather than a dropdown: on a phone a menu anchored to a
 * corner opens away from the thumb, and this one holds destructive actions
 * that should not be reached by accident.
 */
function AccountSheet({ user, onClose, onSignedOut }) {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try { await api.post('/api/auth/logout'); } catch { /* leaving anyway */ }
    onSignedOut?.();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-foreground/40"
         onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-card p-5 pb-8"
           style={{ boxShadow: '0 -8px 24px rgba(28,25,23,.10)' }}
           onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-muted text-sm font-bold">
            {(user?.name || user?.email || '؟')[0]}
          </span>
          <div className="grow">
            <p className="font-bold">{user?.name}</p>
            <p className="ltr text-[11px] text-text-5">{user?.email}</p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-text-4"
                  aria-label="بستن">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-1">
          <SheetLink icon={LayoutDashboard} label="داشبورد" to="/dashboard" onGo={onClose} />
          <SheetLink icon={Settings} label="تنظیمات حساب" to="/settings" onGo={onClose} />
          {user?.role === 'admin' && (
            <SheetLink icon={Shield} label="پنل مدیریت" to="/admin" onGo={onClose} />
          )}
          <button onClick={signOut} disabled={busy}
                  className="flex w-full items-center gap-3 rounded-md p-3 text-sm text-destructive hover:bg-muted disabled:opacity-50">
            <LogOut className="size-4" />
            {busy ? 'در حال خروج…' : 'خروج از حساب'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Closes the sheet as it navigates. Left open, it would still be covering the
 * page the person just asked for when they arrive.
 */
function SheetLink({ icon: Icon, label, to, onGo }) {
  return (
    <Link to={to} onClick={onGo}
          className="flex items-center gap-3 rounded-md p-3 text-sm hover:bg-muted">
      <Icon className="size-4 text-text-4" />
      {label}
    </Link>
  );
}
