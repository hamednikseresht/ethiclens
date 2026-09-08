import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  useResource, useAction, Panel, Field, TextField, SelectField, Toggle, Status, Skeleton
} from './ui';
import { Button } from '@/components/ui/button';

/**
 * Site identity, model parameters, and the registration rules.
 *
 * The default model gets its own warning because it is the single setting
 * that takes the whole product down: if it names a model that is disabled or
 * gone, every analysis fails at the first request with an error that looks
 * like the provider's fault.
 */
export default function Site() {
  const { data, error, loading, reload } = useResource('/api/admin/settings');
  const [form, setForm] = useState(null);
  const act = useAction(reload);

  useEffect(() => {
    if (!data) return;
    setForm({
      site_title: data.site_title || '',
      site_name: data.site_name || '',
      site_alternate_name: data.site_alternate_name || '',
      site_tagline: data.site_tagline || '',
      site_url: data.site_url || '',
      og_image: data.og_image || '',
      twa_package_name: data.twa_package_name || '',
      twa_fingerprints: data.twa_fingerprints || '',
      default_model: data.default_model || '',
      temperature: data.temperature ?? '',
      top_p: data.top_p ?? '',
      max_tokens: data.max_tokens ?? '',
      reasoning_headroom: data.reasoning_headroom ?? '',
      allow_registration: data.allow_registration === '1',
      default_daily_quota: data.default_daily_quota ?? ''
    });
  }, [data]);

  if (error) return <Status error={error} />;
  if (loading || !data || !form) return <Skeleton rows={4} />;

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const save = () => act.run(() => api.post('/api/admin/settings', {
    ...form,
    allow_registration: form.allow_registration ? '1' : '0'
  }));

  const modelOptions = [
    { value: '', label: '— انتخاب کنید —' },
    ...data.modelOptions.map(m => ({ value: m.ref, label: m.label }))
  ];

  return (
    <div className="space-y-3">
      <Panel title="هویت سایت">
        <TextField label="عنوان صفحه" id="s-title" value={form.site_title} onChange={set('site_title')}
                   hint="در تب مرورگر و به‌عنوان تیتر در نتایج جست‌وجو می‌آید؛ می‌تواند توضیح هم داشته باشد." />
        <TextField label="نام برند" id="s-name" value={form.site_name} onChange={set('site_name')}
                   hint="فقط نام، بدون توضیح — همین را گوگل بالای نتایج سایت نشان می‌دهد. خالی بماند، از بخش اول «عنوان صفحه» برداشته می‌شود." />
        <TextField label="نام لاتین" id="s-alt" dir="ltr" value={form.site_alternate_name}
                   onChange={set('site_alternate_name')}
                   hint="نام دوم برند، برای جست‌وجوی لاتین. مثل Ethic Lens." />
        <TextField label="شعار" id="s-tag" value={form.site_tagline} onChange={set('site_tagline')} />
        <TextField label="آدرس سایت" id="s-url" dir="ltr" value={form.site_url}
                   onChange={set('site_url')}
                   hint="در نقشه سایت و آدرس‌های کانونیکال استفاده می‌شود." />
        <TextField label="تصویر اشتراک‌گذاری" id="s-og" dir="ltr" value={form.og_image}
                   onChange={set('og_image')}
                   hint="نشانی تصویری که هنگام اشتراک لینک نشان داده می‌شود." />
      </Panel>

      {/* The Android wrapper's half of the Digital Asset Links handshake.
          Kept out of "site identity" because it means nothing until an app
          exists, and the fingerprint only exists after the first upload. */}
      <Panel title="اپ اندروید (TWA)"
             hint="تا وقتی هر دو فیلد پر نشوند، /.well-known/assetlinks.json کد ۴۰۴ می‌دهد و اپ اندروید نوار نشانی را نشان می‌دهد.">
        <TextField label="نام بسته" id="s-twa-pkg" dir="ltr" value={form.twa_package_name}
                   onChange={set('twa_package_name')}
                   hint="مثل ir.ethiclens.twa — همان applicationId اپ اندروید." />
        <Field id="s-twa-fp" label="اثر انگشت SHA-256"
               hint="هر اثر انگشت در یک خط. معمولاً دو تا لازم است: کلید آپلود خودتان، و کلید امضای گوگل که در Play Console زیر Setup ← App integrity می‌بینید — چون گوگل بسته را با کلید خودش دوباره امضا می‌کند و همان است که روی گوشی کاربر نصب می‌شود. خط‌هایی که قالب درست ندارند نادیده گرفته می‌شوند.">
          <textarea id="s-twa-fp" rows={4} dir="ltr" value={form.twa_fingerprints}
                    onChange={set('twa_fingerprints')}
                    placeholder={'AB:CD:…:12\n34:56:…:78'}
                    className="w-full rounded-md border border-input bg-card p-3 font-mono text-[11px]
                               leading-loose focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-ring" />
        </Field>
      </Panel>

      <Panel title="مدل پیش‌فرض">
        {!data.defaultModelValid && (
          <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive-soft p-2.5
                        text-justify text-[12px] leading-loose text-destructive">
            مدل پیش‌فرض فعلی در دسترس نیست. تا وقتی مدل معتبری انتخاب نشود، هیچ تحلیلی اجرا نمی‌شود.
          </p>
        )}
        <SelectField label="مدل" id="s-model" value={form.default_model}
                     onChange={set('default_model')} options={modelOptions} />

        <TextField label="Temperature" id="s-temp" dir="ltr" type="number" step="0.05" min="0" max="2"
                   value={form.temperature} onChange={set('temperature')}
                   hint="پایین‌تر یعنی پاسخ باثبات‌تر و کم‌تنوع‌تر." />
        <TextField label="Top-p" id="s-topp" dir="ltr" type="number" step="0.05" min="0" max="1"
                   value={form.top_p} onChange={set('top_p')} />
        <TextField label="حداکثر توکن خروجی" id="s-max" dir="ltr" type="number" min="0"
                   value={form.max_tokens} onChange={set('max_tokens')} />
        <TextField label="فضای استدلال" id="s-head" dir="ltr" type="number" min="0"
                   value={form.reasoning_headroom} onChange={set('reasoning_headroom')}
                   hint="توکن اضافه‌ای که برای مدل‌های استدلالی کنار گذاشته می‌شود تا خروجی نصفه نماند." />
      </Panel>

      <Panel title="عضویت">
        <Toggle label="ثبت‌نام باز باشد"
                hint="خاموش کردنش جلوی ساخت حساب تازه را می‌گیرد؛ حساب‌های موجود دست‌نخورده می‌مانند."
                checked={form.allow_registration} onChange={set('allow_registration')} />
        <TextField label="سهمیه روزانه پیش‌فرض" id="s-quota" type="number" min="0"
                   value={form.default_daily_quota} onChange={set('default_daily_quota')}
                   hint="برای حساب‌های تازه، پیش از آنکه گروهی به آن‌ها داده شود." />
      </Panel>

      <Status msg={act.msg} error={act.error} />
      <Button variant="primary" onClick={save} disabled={act.busy} className="w-full">
        {act.busy ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
      </Button>
    </div>
  );
}
