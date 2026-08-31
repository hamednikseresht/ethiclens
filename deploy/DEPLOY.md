# راهنمای استقرار روی سرور اوبونتو

راهنمای گام‌به‌گام برای اجرای دیدگاه اخلاق روی Ubuntu 22.04 / 24.04 پشت nginx با HTTPS.

---

## ۱. پیش‌نیازها

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx build-essential
```

نصب Node.js نسخه ۲۲ (LTS):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

> `better-sqlite3` برای Node 20/22 باینری آماده دارد و نیازی به کامپایل ندارد.
> اگر نسخه Node شما خیلی تازه باشد و باینری آماده نداشته باشد، `build-essential` و `python3` برای کامپایل لازم است.

---

## ۲. ساخت کاربر سرویس

```bash
sudo useradd --system --create-home --home-dir /opt/ethiclens --shell /usr/sbin/nologin ethiclens
```

---

## ۳. دریافت کد

```bash
sudo -u ethiclens git clone https://github.com/YOUR_USER/ethiclens.git /opt/ethiclens
cd /opt/ethiclens
sudo -u ethiclens npm ci --omit=dev
sudo -u ethiclens mkdir -p /opt/ethiclens/data
```

> اگر `npm ci` به‌خاطر اسکریپت نصب `better-sqlite3` هشدار داد،
> با `sudo -u ethiclens npm install --omit=dev --foreground-scripts` نصب کنید.

---

## ۴. تنظیم متغیرهای محیطی

```bash
sudo -u ethiclens cp /opt/ethiclens/.env.example /opt/ethiclens/.env
sudo -u ethiclens nano /opt/ethiclens/.env
```

مقادیری که **حتماً** باید عوض شوند:

| متغیر | مقدار |
|---|---|
| `SESSION_SECRET` | خروجی `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | حساب مدیر اولیه |
| `TRUST_PROXY` | `1` — وگرنه IP همه کاربران، IP خود nginx دیده می‌شود |
| `SECURE_COOKIE` | `1` (چون پشت HTTPS هستید) |
| `NODE_ENV` | `production` |

کلیدهای سرویس — دست‌کم یکی لازم است:

| متغیر | توضیح |
|---|---|
| `NVIDIA_API_KEY` | کلید `nvapi-…` |
| `OPENAI_API_KEY` | کلید `sk-…` |
| `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` | برای ایمیل تأیید حساب |
| `MAILGUN_BASE_URL` | حساب اروپایی: `https://api.eu.mailgun.net` |

> این متغیرها فقط برای **راه‌اندازی اولیه**اند. پس از بالا آمدن سرویس، همه
> کلیدها و ارائه‌دهنده‌ها از پنل مدیریت قابل تنظیم‌اند و در پایگاه داده
> ذخیره می‌شوند. ارائه‌دهنده‌ای که کلید نداشته باشد، ساخته ولی خاموش می‌ماند.

**نشانی سایت را فراموش نکنید.** پس از اولین ورود، در پنل مدیریت →
تنظیمات سایت، `site_url` را روی `https://ethiclens.ir` بگذارید. پیوند
ایمیل‌های تأیید، `canonical` صفحات عمومی و نقشه سایت همه از این ساخته
می‌شوند؛ اگر خالی بماند از هدر `Host` استفاده می‌شود که پشت پراکسی
می‌تواند اشتباه باشد.

سپس دسترسی فایل را محدود کنید — این فایل کلید API دارد:

```bash
sudo chmod 600 /opt/ethiclens/.env
sudo chown ethiclens:ethiclens /opt/ethiclens/.env
```

---

## ۵. سرویس systemd

```bash
sudo cp /opt/ethiclens/deploy/ethiclens.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ethiclens
sudo systemctl status ethiclens
```

مشاهده لاگ زنده:

```bash
sudo journalctl -u ethiclens -f
```

---

## ۶. nginx و گواهی HTTPS

```bash
sudo cp /opt/ethiclens/deploy/nginx.conf /etc/nginx/sites-available/ethiclens
sudo nano /etc/nginx/sites-available/ethiclens   # در صورت نیاز دامنه را بررسی کنید
sudo ln -s /etc/nginx/sites-available/ethiclens /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

گواهی رایگان Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ethiclens.ir -d www.ethiclens.ir
```

> **مهم:** بلوک `location /api/analyze/` باید `proxy_buffering off;` داشته باشد.
> بدون آن، پاسخ استریمی بافر می‌شود و کاربر تا پایان تحلیل صفحه‌ای خالی می‌بیند.

---

## ۷. فایروال

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

پورت ۳۰۰۰ نباید از بیرون باز باشد — برنامه فقط از طریق nginx در دسترس است.

---

## ۸. اولین ورود

۱. به `https://ethiclens.ir/login` بروید.
۲. با `ADMIN_EMAIL` و `ADMIN_PASSWORD` وارد شوید.
۳. **فوراً** از «تنظیمات حساب» رمز را عوض کنید.
۴. به `/admin` → «مدل و کلید» بروید و دکمه **آزمایش اتصال** را بزنید.

---

## به‌روزرسانی نسخه

```bash
cd /opt/ethiclens
sudo -u ethiclens git pull
sudo -u ethiclens npm ci --omit=dev
sudo systemctl restart ethiclens
```

جدول‌های پایگاه داده با `CREATE TABLE IF NOT EXISTS` ساخته می‌شوند، پس به‌روزرسانی داده‌ای را پاک نمی‌کند.

---

## پشتیبان‌گیری

کل وضعیت برنامه در یک پوشه است: `/opt/ethiclens/data`.

```bash
sudo -u ethiclens sqlite3 /opt/ethiclens/data/ethiclens.db ".backup '/opt/ethiclens/data/backup-$(date +%F).db'"
```

پشتیبان‌گیری روزانه با cron:

```bash
sudo crontab -e
```

```cron
0 3 * * * sudo -u ethiclens sqlite3 /opt/ethiclens/data/ethiclens.db ".backup '/var/backups/ethiclens-$(date +\%F).db'" && find /var/backups -name 'ethiclens-*.db' -mtime +14 -delete
```

---

## عیب‌یابی

| نشانه | بررسی کنید |
|---|---|
| سرویس بالا نمی‌آید | `journalctl -u ethiclens -n 50` |
| خطای «کلید API نامعتبر» | `/admin` → مدل و کلید → آزمایش اتصال |
| تحلیل شروع می‌شود ولی متن نمی‌آید | `proxy_buffering off` در بلوک `/api/analyze/` |
| بعد از ورود دوباره به صفحه ورود می‌رود | `SECURE_COOKIE=1` و `TRUST_PROXY=1` را بررسی کنید |
| خطای `SQLITE_READONLY` | مالکیت پوشه: `sudo chown -R ethiclens:ethiclens /opt/ethiclens/data` |
| مدل ۴۰۴ می‌دهد | شناسه مدل را با «دریافت فهرست مدل‌های حساب» بررسی کنید |
