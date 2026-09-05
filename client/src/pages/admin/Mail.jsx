import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  useResource, useAction, Panel, TextField, SelectField, Toggle, Status, Skeleton, Pill
} from './ui';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

/**
 * Outgoing mail, and the account rules that depend on it.
 *
 * Verification and password recovery are grouped here rather than under site
 * settings because both stop working the moment mail does. Requiring
 * verification with no mail provider configured locks every new account out
 * with no way back, so that switch is disabled until mail works.
 *
 * Secrets are never sent back by the server — only whether one is stored. An
 * empty field therefore means "keep what is there", which every such field
 * says under itself.
 */
export default function Mail() {
  const { data, error, loading, reload } = useResource('/api/admin/settings');
  const [form, setForm] = useState(null);
  const act = useAction(reload);

  useEffect(() => {
    if (!data) return;
    setForm({
      mail_provider: data.mail_provider || 'brevo',
      mail_from_name: data.mail_from_name || '',
      mail_from_email: data.mail_from_email || '',
      brevo_api_key: '',
      mailgun_api_key: '',
      mailgun_domain: data.mailgun_domain || '',
      mailgun_base_url: data.mailgun_base_url || '',
      smtp_host: data.smtp_host || '',
      smtp_port: data.smtp_port || '',
      smtp_user: data.smtp_user || '',
      smtp_pass: '',
      smtp_secure: data.smtp_secure === '1',
      require_verification: data.require_verification === '1',
      verification_gate: data.verification_gate || 'analysis',
      signup_code: data.signup_code === '1'
    });
  }, [data]);

  if (error) return <Status error={error} />;
  if (loading || !data || !form) return <Skeleton rows={4} />;

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const save = () => act.run(() => api.post('/api/admin/settings', {
    ...form,
    smtp_secure: form.smtp_secure ? '1' : '0',
    require_verification: form.require_verification ? '1' : '0',
    signup_code: form.signup_code ? '1' : '0',
    // Blank means "unchanged"; sending it would wipe a stored secret.
    brevo_api_key: form.brevo_api_key || undefined,
    mailgun_api_key: form.mailgun_api_key || undefined,
    smtp_pass: form.smtp_pass || undefined
  }));

  const provider = form.mail_provider;

  return (
    <div className="space-y-3">
      <Panel title="وضعیت"
             action={<Pill tone={data.mailConfigured ? 'ok' : 'danger'}>
               {data.mailConfigured ? 'آماده' : 'تنظیم نشده'}
             </Pill>}>
        {!data.mailConfigured && (
          <p className="text-justify text-[12.5px] leading-loose text-text-3">
            تا وقتی ایمیل تنظیم نشود، تأیید حساب، بازیابی رمز و اطلاع‌رسانی تأیید عضویت کار نمی‌کند.
          </p>
        )}
        <TestMail configured={data.mailConfigured} />
      </Panel>

      <Panel title="سرویس ارسال">
        <SelectField label="ارائه‌دهنده" id="m-prov" value={provider}
                     onChange={set('mail_provider')}
                     options={(data.mailProviders || []).map(p => ({
                       value: typeof p === 'string' ? p : p.key,
                       label: typeof p === 'string' ? p : (p.label || p.key)
                     }))} />

        <TextField label="نام فرستنده" id="m-fn" value={form.mail_from_name}
                   onChange={set('mail_from_name')} />
        <TextField label="ایمیل فرستنده" id="m-fe" dir="ltr" type="email"
                   value={form.mail_from_email} onChange={set('mail_from_email')} />

        {provider === 'brevo' && (
          <TextField label="کلید Brevo" id="m-bk" type="password" dir="ltr"
                     value={form.brevo_api_key} onChange={set('brevo_api_key')}
                     hint={data.brevoKeySet ? 'کلیدی ذخیره شده است؛ خالی بگذارید تا همان بماند.'
                                            : 'هنوز کلیدی ذخیره نشده است.'} />
        )}

        {provider === 'mailgun' && (
          <>
            <TextField label="کلید Mailgun" id="m-mk" type="password" dir="ltr"
                       value={form.mailgun_api_key} onChange={set('mailgun_api_key')}
                       hint="خالی بگذارید تا کلید فعلی بماند." />
            <TextField label="دامنه" id="m-md" dir="ltr" value={form.mailgun_domain}
                       onChange={set('mailgun_domain')} />
            <TextField label="آدرس پایه" id="m-mb" dir="ltr" value={form.mailgun_base_url}
                       onChange={set('mailgun_base_url')}
                       hint="برای حساب اروپایی: https://api.eu.mailgun.net" />
          </>
        )}

        {provider === 'smtp' && (
          <>
            <TextField label="میزبان SMTP" id="m-sh" dir="ltr" value={form.smtp_host}
                       onChange={set('smtp_host')} />
            <TextField label="پورت" id="m-sp" dir="ltr" type="number" value={form.smtp_port}
                       onChange={set('smtp_port')} hint="۵۸۷ برای STARTTLS، ۴۶۵ برای SSL." />
            <TextField label="نام کاربری" id="m-su" dir="ltr" value={form.smtp_user}
                       onChange={set('smtp_user')} />
            <TextField label="رمز" id="m-spw" type="password" dir="ltr" value={form.smtp_pass}
                       onChange={set('smtp_pass')}
                       hint={data.smtpPassSet ? 'رمزی ذخیره شده است؛ خالی بگذارید تا همان بماند.'
                                              : 'هنوز رمزی ذخیره نشده است.'} />
            <Toggle label="اتصال امن (SSL)" checked={form.smtp_secure}
                    hint="برای پورت ۴۶۵ روشن، برای ۵۸۷ خاموش."
                    onChange={set('smtp_secure')} />
          </>
        )}
      </Panel>

      <Panel title="تأیید حساب">
        <Toggle label="تأیید ایمیل اجباری باشد"
                hint={data.mailConfigured
                  ? 'کاربر تا تأیید ایمیل نمی‌تواند از سامانه استفاده کند.'
                  : 'تا وقتی سرویس ایمیل تنظیم نشده این گزینه در دسترس نیست — روشن کردنش همه حساب‌های تازه را بی‌راه‌حل قفل می‌کند.'}
                disabled={!data.mailConfigured}
                checked={form.require_verification}
                onChange={set('require_verification')} />

        {form.require_verification && (
          <SelectField label="کجا سد شود" id="m-gate" value={form.verification_gate}
                       onChange={set('verification_gate')}
                       options={[
                         { value: 'analysis', label: 'هنگام تحلیل' },
                         { value: 'login', label: 'هنگام ورود' }
                       ]} />
        )}

        <Toggle label="ورود با کد یک‌بارمصرف"
                hint={data.mailConfigured
                  ? 'در صفحه ورود، گزینه دریافت کد به‌جای رمز نشان داده می‌شود.'
                  : 'نیازمند سرویس ایمیل.'}
                disabled={!data.mailConfigured}
                checked={form.signup_code}
                onChange={set('signup_code')} />
      </Panel>

      <Status msg={act.msg} error={act.error} />
      <Button variant="primary" onClick={save} disabled={act.busy} className="w-full">
        {act.busy ? 'در حال ذخیره…' : 'ذخیره تنظیمات ایمیل'}
      </Button>
    </div>
  );
}

function TestMail({ configured }) {
  const [to, setTo] = useState('');
  const act = useAction();

  return (
    <div className="mt-3 border-t border-border pt-3">
      <TextField label="ارسال ایمیل آزمایشی" id="m-test" type="email" dir="ltr" value={to}
                 onChange={(e) => setTo(e.target.value)}
                 hint="خالی بگذارید تا به ایمیل خودتان فرستاده شود." />
      <Status msg={act.msg} error={act.error} className="mb-2" />
      <Button size="sm" variant="outline" disabled={!configured || act.busy}
              onClick={() => act.run(() => api.post('/api/admin/test-mail', { to }), 'فرستاده شد.')}>
        <Send className="size-3.5" />
        {act.busy ? 'در حال ارسال…' : 'ارسال آزمایشی'}
      </Button>
    </div>
  );
}
