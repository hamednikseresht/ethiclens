import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { LazyRoute } from '@/components/LazyRoute';

/**
 * The admin panel's frame.
 *
 * Eleven sections, each its own route rather than a tab in one component.
 * That is what makes /admin/users a link an admin can bookmark or send to
 * another admin, and it means a section's data is fetched when it is opened
 * instead of all eleven on load.
 *
 * The section strip scrolls sideways. Wrapping it to three rows on a phone
 * would push the actual content below the fold on every section.
 */

export const SECTIONS = [
  { to: '',           label: 'نمای کلی' },
  { to: 'ai',         label: 'مدل‌ها' },
  { to: 'prompts',    label: 'دستور تحلیل' },
  { to: 'users',      label: 'کاربران' },
  { to: 'tiers',      label: 'گروه‌ها' },
  { to: 'analyses',   label: 'تحلیل‌ها' },
  { to: 'mail',       label: 'ایمیل' },
  { to: 'categories', label: 'دسته‌بندی' },
  { to: 'guide',      label: 'دانشنامه' },
  { to: 'site',       label: 'سایت' },
  { to: 'audit',      label: 'رخدادها' }
];

export default function AdminLayout({ user }) {
  // Mirrors the server's requireAdmin. Without it a non-admin sees a shell of
  // empty sections whose every request comes back 403.
  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="pb-6">
      <header className="mx-auto max-w-xl px-5 pt-6">
        <h1 className="display text-[30px] font-semibold leading-tight">پنل مدیریت</h1>
      </header>

      <nav className="sticky z-10 mt-4 border-y border-border bg-background/95 backdrop-blur"
           style={{ top: 'calc(56px + env(safe-area-inset-top, 0px))' }}>
        <div className="mx-auto flex max-w-xl gap-1.5 overflow-x-auto px-5 py-2
                        [-ms-overflow-style:none] [scrollbar-width:none]
                        [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map(s => (
            <NavLink key={s.to} to={s.to} end={s.to === ''}
                     className={({ isActive }) =>
                       `shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                         isActive ? 'border-primary bg-primary-soft text-primary'
                                  : 'border-border bg-card text-text-4'}`}>
              {s.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Its own boundary, inside the layout: each section is a separate
          chunk, and suspending here keeps the heading and the section strip
          on screen while one loads. A boundary further out would blank the
          whole panel and make switching sections feel like a page load. */}
      <div className="mx-auto max-w-xl px-5 pt-5">
        <LazyRoute>
          <Outlet />
        </LazyRoute>
      </div>
    </div>
  );
}
