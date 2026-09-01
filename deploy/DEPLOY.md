# راهنمای استقرار روی سرور اوبونتو

راهنمای گام‌به‌گام برای اجرای دیدگاه اخلاق روی Ubuntu 22.04 / 24.04، پشت
nginx و کلادفلر، با گواهی Origin و حالت Full (strict).

شاخه استقرار `main` است.

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

شاخه استقرار **`main`** است.

گام قبل، `/opt/ethiclens` را به‌عنوان خانه کاربر سرویس ساخته است، پس این
پوشه **خالی نیست** و `git clone` مستقیم روی آن شکست می‌خورد:

```
fatal: destination path '/opt/ethiclens' already exists and is not an empty directory
```

به‌جایش در پوشه موقت clone کنید و محتوا را بکشید داخل:

```bash
sudo -u ethiclens git clone -b main https://github.com/hamednikseresht/ethiclens.git /tmp/ethiclens-src
sudo -u ethiclens cp -a /tmp/ethiclens-src/. /opt/ethiclens/
sudo -u ethiclens git -C /opt/ethiclens remote -v
rm -rf /tmp/ethiclens-src
```

سپس نصب وابستگی‌ها:

```bash
cd /opt/ethiclens
sudo -u ethiclens npm ci --omit=dev
sudo -u ethiclens mkdir -p /opt/ethiclens/data
```

> **اگر `npm ci` گفت `package-lock.json` پیدا نشد**، یعنی مرحله بالا ناقص
> انجام شده و فایل‌ها کامل کپی نشده‌اند. با `ls /opt/ethiclens` بررسی کنید
> که `package.json`، `package-lock.json` و پوشه `server/` هر سه باشند.
>
> به‌جای `npm ci` از `npm install` **استفاده نکنید**: نسخه‌ها را تازه حل
> می‌کند و درختی متفاوت با آنچه آزموده شده نصب می‌شود. `better-sqlite3`
> باینری بومی دارد و یک جهش خاموش نسخه در آن، هنگام اجرا خطا می‌دهد نه
> هنگام نصب. فایل قفل را درست بیاورید و روی `npm ci` بمانید.

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
| `BREVO_API_KEY` | سرویس ایمیل پیش‌فرض — برای ایمیل تأیید حساب |
| `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` | فقط اگر به‌جای Brevo از میل‌گان استفاده می‌کنید |
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

## ۶. کلادفلر — DNS و SSL

معماری نهایی سه حلقه دارد:

```
کاربر ──TLS عمومی──▶ کلادفلر ──TLS با گواهی Origin──▶ nginx ──HTTP محلی──▶ برنامه
```

### ۶.۱ افزودن دامنه و رکوردها

در پیشخان کلادفلر دامنه `ethiclens.ir` را اضافه کنید، سپس nameserverهایی
که می‌دهد را در پنل ثبت‌کننده دامنه بگذارید. بعد دو رکورد بسازید:

| نوع | نام | مقدار | وضعیت |
|---|---|---|---|
| A | `ethiclens.ir` | نشانی IP سرور | ☁️ Proxied (نارنجی) |
| A | `www` | نشانی IP سرور | ☁️ Proxied (نارنجی) |

ابر باید **نارنجی** باشد. اگر خاکستری بماند، کلادفلر فقط DNS می‌دهد و نه
گواهی، نه محافظت، و نه پنهان‌کردن نشانی سرور.

### ۶.۲ گواهی Origin

در **SSL/TLS → Origin Server → Create Certificate** یک گواهی بسازید
(پیش‌فرض‌ها خوب‌اند: RSA، اعتبار ۱۵ سال، شامل `ethiclens.ir` و `*.ethiclens.ir`).
دو متن به شما می‌دهد. روی سرور:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/ethiclens.ir.pem   # بخش Origin Certificate
sudo nano /etc/ssl/cloudflare/ethiclens.ir.key   # بخش Private Key
sudo chmod 600 /etc/ssl/cloudflare/ethiclens.ir.key
sudo chmod 644 /etc/ssl/cloudflare/ethiclens.ir.pem
```

> کلید خصوصی فقط همان یک بار نمایش داده می‌شود. اگر نبستیدش، باید گواهی
> تازه بسازید.

این گواهی را فقط کلادفلر معتبر می‌داند و همین کافی است، چون تنها کلادفلر
مستقیم با سرور حرف می‌زند. اعتبارش ۱۵ سال است، پس برخلاف Let's Encrypt
تمدید خودکار نمی‌خواهد.

### ۶.۳ حالت SSL

در **SSL/TLS → Overview** حالت را روی **Full (strict)** بگذارید.

| حالت | چه می‌کند | مناسب؟ |
|---|---|---|
| Flexible | کلادفلر تا سرور رمزنگاری نمی‌کند | ❌ حلقه تغییر مسیر می‌سازد و ترافیک لخت می‌ماند |
| Full | رمزنگاری می‌شود ولی گواهی بررسی نمی‌شود | ⚠️ در برابر حمله میانی باز است |
| **Full (strict)** | رمزنگاری + بررسی گواهی | ✅ همین را انتخاب کنید |

همچنین **Always Use HTTPS** را روشن کنید.

### ۶.۴ قاعده کش برای مسیرهای API

کلادفلر نباید پاسخ‌های API را کش کند. در **Caching → Cache Rules** یک
قاعده بسازید:

- **اگر** `URI Path` با `/api/` شروع شود
- **آنگاه** `Bypass cache`

### ۶.۵ نصب پیکربندی nginx

```bash
sudo cp /opt/ethiclens/deploy/cloudflare-realip.conf /etc/nginx/cloudflare-realip.conf
sudo cp /opt/ethiclens/deploy/nginx.conf /etc/nginx/sites-available/ethiclens
sudo ln -s /etc/nginx/sites-available/ethiclens /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

بازه‌های کلادفلر را تازه کنید و ماهانه تکرارش کنید:

```bash
sudo bash /opt/ethiclens/deploy/update-cloudflare-ips.sh
```

```cron
17 4 1 * * bash /opt/ethiclens/deploy/update-cloudflare-ips.sh >> /var/log/cf-ips.log 2>&1
```

> **چرا `cloudflare-realip.conf` اختیاری نیست:** بدون آن، nginx نشانی سرور
> لبه کلادفلر را به‌عنوان نشانی کاربر می‌بیند. محدودکننده نرخ ورود در
> `server/routes/auth.js` بر پایه `req.ip` کار می‌کند و سقفش ۲۰ تلاش ناموفق
> در ۱۵ دقیقه است — یعنی بیست تلاش ناموفق از هر جای دنیا، ورود را برای
> **همه کاربران** قفل می‌کند. همین برای سقف ثبت‌نام هم صادق است.

> **درباره استریم:** بلوک `location ~ ^/api/(v1/)?analyze` باید
> `proxy_buffering off;` داشته باشد، وگرنه کاربر تا پایان تحلیل چیزی
> نمی‌بیند. کلادفلر هم مهلت حدود ۱۰۰ ثانیه‌ای برای پاسخ مبدأ دارد
> (خطای ۵۲۴)، ولی برنامه هر ۱۵ ثانیه یک ضربان روی استریم می‌فرستد و
> سربرگ‌های `no-transform` و `X-Accel-Buffering: no` را می‌گذارد، پس
> تحلیل‌های طولانی (تا ۳۴۰ ثانیه) بی‌مشکل رد می‌شوند.

---

## ۷. فایروال — فقط کلادفلر

اگر پورت ۴۴۳ برای همه باز باشد، هر کسی که نشانی IP سرور را پیدا کند
می‌تواند کلادفلر را دور بزند. پس ورودی را به بازه‌های کلادفلر محدود کنید:

```bash
sudo ufw allow OpenSSH
for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
  sudo ufw allow proto tcp from "$ip" to any port 443
done
sudo ufw enable
```

> پیش از `ufw enable` مطمئن شوید `OpenSSH` اجازه دارد، وگرنه خودتان را
> بیرون می‌گذارید.

پورت ۸۰ را می‌توانید بسته نگه دارید، چون کلادفلر با **Always Use HTTPS**
خودش تغییر مسیر می‌دهد. پورت ۳۰۰۰ هرگز نباید از بیرون باز باشد — برنامه
فقط از راه nginx در دسترس است.

**لایه دوم (توصیه‌شده):** Authenticated Origin Pulls را روشن کنید تا nginx
گواهی خود کلادفلر را هم بررسی کند. دستورش در بالای `deploy/nginx.conf`
به‌صورت توضیح آمده است.

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
sudo -u ethiclens git pull origin main
sudo -u ethiclens npm ci --omit=dev
sudo systemctl restart ethiclens
```

> اگر گام ۳ را با کپی از پوشه موقت انجام داده‌اید، `git pull` کار می‌کند
> چون پوشه `.git` هم کپی شده است. با `git -C /opt/ethiclens remote -v`
> بررسی کنید که مخزن به‌درستی وصل باشد.

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
| `npm ci` می‌گوید فایل قفل نیست | فایل‌ها کامل کپی نشده‌اند — گام ۳ را دوباره ببینید |
| خطای ۵۲۱ کلادفلر | nginx بالا نیست یا فایروال بازه‌های کلادفلر را نمی‌پذیرد |
| خطای ۵۲۶ کلادفلر | حالت Full (strict) است ولی گواهی Origin نصب نشده یا مسیرش غلط است |
| خطای ۵۲۴ کلادفلر | پاسخ بیش از ۱۰۰ ثانیه ساکت مانده — سرویس را بررسی کنید |
| حلقه بی‌پایان تغییر مسیر | حالت SSL روی Flexible است؛ باید Full (strict) باشد |
| همه کاربران با هم قفل می‌شوند | `cloudflare-realip.conf` نصب یا `include` نشده است |
| نشانی همه کاربران یکی دیده می‌شود | همان مورد بالا — با `tail /var/log/nginx/ethiclens.access.log` بررسی کنید |
