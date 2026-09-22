import { NavLink, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAdminNotifications } from '@/lib/notifications';
import { OfflineBar } from '@/components/OfflineBar';
import { Sheet } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Compass, Clock, Globe, BookOpen, LogOut, Settings, Shield, LayoutDashboard } from 'lucide-react';
import { fa } from '@/lib/fa';
import { cn } from '@/lib/utils';

/**
 * The app frame: a header with the account button, and a four-tab bar pinned
 * to the bottom.
 *
 * The four destinations appear twice and only one is ever visible. Below
 * 768px they are a bar pinned to the bottom, inside thumb reach; above it
 * they sit in the header and the bottom bar is gone.
 */

const TABS = [
  { to: '/',        label: 'تحلیل تازه', icon: Compass },
  { to: '/history', label: 'تاریخچه',    icon: Clock },
  { to: '/explore', label: 'عمومی',      icon: Globe },
  { to: '/guide',   label: 'دانشنامه',   icon: BookOpen }
];

export function AppShell({ user, children, onSignedOut }) {
  const { pathname } = useLocation();
  const { pendingUsers } = useAdminNotifications(user?.role === 'admin');
  const immersive = pathname === '/' && new URLSearchParams(location.search).has('id');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <OfflineBar />
        <div className="mx-auto flex h-14 max-w-xl md:max-w-4xl items-center gap-3 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/icons/mark.svg" width="28" height="28" alt=""
                 className="size-7 shrink-0 rounded-lg" />
            <span className="text-sm font-medium tracking-tight">دیدگاه اخلاق</span>
          </Link>

          <nav className="hidden grow items-center justify-center gap-1 md:flex" aria-label="اصلی">
            {TABS.map(t => (
              <NavLink key={t.to} to={t.to} end={t.to === '/'}
                       className={({ isActive }) =>
                         cn('flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-150',
                           isActive
                             ? 'bg-primary text-primary-foreground'
                             : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <t.icon className="size-4" aria-hidden="true" />
                {t.label}
              </NavLink>
            ))}
          </nav>

          <span className="grow md:hidden" />
          <AccountMenu user={user} pendingUsers={pendingUsers} onSignedOut={onSignedOut} />
        </div>
      </header>

      <main className="pb-24 md:pb-8">{children}</main>

      {!immersive && (
        <nav className="fixed inset-x-4 bottom-3 z-20 rounded-full border border-border bg-card/90 shadow-[var(--shadow-md)] backdrop-blur-md md:hidden"
             style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
             aria-label="اصلی">
          <div className="mx-auto flex max-w-xl px-1">
            {TABS.map(t => (
              <NavLink key={t.to} to={t.to} end={t.to === '/'}
                       className={({ isActive }) =>
                         cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-full text-[11px] font-medium transition-colors duration-150',
                           isActive ? 'text-foreground' : 'text-muted-foreground')}>
                {({ isActive }) => (
                  <>
                    <t.icon className="size-5" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
                    {t.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function AvatarButton({ user, pendingUsers, className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'relative grid size-9 place-items-center rounded-full border border-border bg-muted text-xs font-medium',
        className
      )}
      aria-label={pendingUsers
        ? `حساب کاربری — ${fa(pendingUsers)} کاربر منتظر تأیید`
        : 'حساب کاربری'}
      {...props}
    >
      {(user?.name || user?.email || '؟')[0]}
      {pendingUsers > 0 && (
        <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-background" />
      )}
    </button>
  );
}

/**
 * Phone: bottom sheet (thumb reach, room above the keyboard).
 * Desktop: dropdown anchored to the avatar — the shadcn account-menu pattern.
 */
function AccountMenu({ user, pendingUsers, onSignedOut }) {
  const [sheet, setSheet] = useState(false);

  return (
    <>
      <div className="md:hidden">
        <AvatarButton user={user} pendingUsers={pendingUsers} onClick={() => setSheet(true)} />
      </div>
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AvatarButton user={user} pendingUsers={pendingUsers} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <p className="font-semibold text-foreground">{user?.name}</p>
              <p className="ltr mt-0.5 font-normal">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <MenuLink icon={LayoutDashboard} to="/dashboard">داشبورد</MenuLink>
            <MenuLink icon={Settings} to="/settings">تنظیمات حساب</MenuLink>
            {user?.role === 'admin' && (
              <MenuLink icon={Shield} to="/admin" badge={pendingUsers}>پنل مدیریت</MenuLink>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={async (e) => {
                e.preventDefault();
                try { await api.post('/api/auth/logout'); } catch { /* leaving anyway */ }
                onSignedOut?.();
              }}
            >
              <LogOut className="size-4" aria-hidden="true" />
              خروج از حساب
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {sheet && (
        <AccountSheet user={user} pendingUsers={pendingUsers}
                      onClose={() => setSheet(false)} onSignedOut={onSignedOut} />
      )}
    </>
  );
}

function MenuLink({ icon: Icon, to, badge, children }) {
  return (
    <DropdownMenuItem asChild>
      <Link to={to} className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="grow">{children}</span>
        {badge > 0 && (
          <span className="nums rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
            {fa(badge)}
          </span>
        )}
      </Link>
    </DropdownMenuItem>
  );
}

function AccountSheet({ user, pendingUsers, onClose, onSignedOut }) {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try { await api.post('/api/auth/logout'); } catch { /* leaving anyway */ }
    onSignedOut?.();
  };

  return (
    <Sheet title="حساب کاربری" onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full border border-border bg-muted text-sm font-medium">
          {(user?.name || user?.email || '؟')[0]}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{user?.name}</p>
          <p className="ltr truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </div>
      <SheetLink icon={LayoutDashboard} label="داشبورد" to="/dashboard" onGo={onClose} />
      <SheetLink icon={Settings} label="تنظیمات حساب" to="/settings" onGo={onClose} />
      {user?.role === 'admin' && (
        <SheetLink icon={Shield} label="پنل مدیریت" to="/admin" onGo={onClose} badge={pendingUsers} />
      )}
      <button onClick={signOut} disabled={busy}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-destructive hover:bg-muted disabled:opacity-50">
        <LogOut className="size-4" aria-hidden="true" />
        {busy ? 'در حال خروج…' : 'خروج از حساب'}
      </button>
    </Sheet>
  );
}

function SheetLink({ icon: Icon, label, to, onGo, badge }) {
  return (
    <Link to={to} onClick={onGo}
          className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="grow">{label}</span>
      {badge > 0 && (
        <span className="nums rounded-full bg-destructive px-2 py-0.5 text-[10px] font-medium text-destructive-foreground">
          {fa(badge)}
        </span>
      )}
    </Link>
  );
}
