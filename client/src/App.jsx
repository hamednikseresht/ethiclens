import { useEffect, useState } from 'react';
import { api, setCsrf } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Compass, Scale, Users, ShieldCheck } from 'lucide-react';

/**
 * Scaffold screen.
 *
 * Not the product yet — it exists to prove the whole chain works end to end
 * before any page is ported: Tailwind tokens resolve, shadcn primitives
 * render, RTL lays out correctly, Lucide icons draw, and the API client can
 * reach Express through the dev proxy carrying its session.
 */
export default function App() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/auth/me')
      .then(d => { setCsrf(d.csrf); setMe(d); })
      .catch(e => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-5">
          <span className="grid size-8 place-items-center rounded-sm bg-primary text-xs font-black text-primary-foreground">
            EL
          </span>
          <span className="font-black">دیدگاه اخلاق</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 p-5">
        <div>
          <h1 className="display text-[33px] leading-tight font-semibold">
            دوراهی‌ات را از هشت منظر ببین
          </h1>
          <p className="mt-2 text-sm text-text-3">
            این صفحه فقط برای آزمودن زنجیره ابزار است — توکن‌ها، اجزای shadcn،
            راست‌به‌چپ، آیکون‌ها و اتصال به API.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>وضعیت اتصال</CardTitle>
            <CardDescription>پاسخ /api/auth/me از سرور Express</CardDescription>
          </CardHeader>
          <CardContent>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!error && !me && <p className="text-sm text-text-4">در حال بررسی…</p>}
            {me && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-text-4">کاربر</dt>
                <dd className="font-semibold">{me.user ? me.user.name : 'وارد نشده'}</dd>
                <dt className="text-text-4">توکن CSRF</dt>
                <dd className="ltr nums text-xs">{me.csrf ? me.csrf.slice(0, 16) + '…' : '—'}</dd>
              </dl>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary"><Compass /> تحلیل تازه</Button>
          <Button variant="outline"><Scale /> دانشنامه</Button>
          <Button variant="secondary"><Users /> عمومی</Button>
          <Button variant="ghost"><ShieldCheck /> مدیریت</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['فضیلت‌گرایی', 'school-virtue'],
            ['وظیفه‌گرایی', 'school-deontology'],
            ['فایده‌گرایی', 'school-utilitarian'],
            ['خیر مشترک', 'school-commongood'],
            ['قراردادگرایی', 'school-contractual'],
            ['اخلاق مراقبت', 'school-care'],
            ['اگزیستانسیالیسم', 'school-existential'],
            ['تبارشناسی', 'school-genealogy']
          ].map(([name, token]) => (
            <span key={token}
                  className="rounded-full border px-3 py-1 text-[11px] font-bold"
                  style={{ borderColor: `var(--color-${token})`, color: `var(--color-${token})` }}>
              {name}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}
