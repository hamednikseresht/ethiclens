# راهنمای استقرار روی سرور اوبونتو

راهنمای گام‌به‌گام برای اجرای دیدگاه اخلاق روی Ubuntu 22.04 / 24.04، پشت
nginx و کلادفلر، با گواهی Origin و حالت Full (strict).

شاخه استقرار `main` است.

> **از قبل نصب کرده‌اید و فقط می‌خواهید به‌روز کنید؟** یک‌راست به
> [«به‌روزرسانی نسخه»](#به‌روزرسانی-نسخه) بروید — یک دستور است:
> `sudo bash /opt/ethiclens/deploy/update.sh`

---

## ۱. پیش‌نیازها

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx build-essential python3 sqlite3
```

نصب Node.js نسخه ۲۲ (LTS):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

> **`build-essential` و `python3` واقعاً لازم‌اند — اختیاری نیستند.**
> `better-sqlite3@13` هیچ باینری آماده‌ای منتشر نمی‌کند (ریلیزش صفر فایل
> دارد)، پس روی هر ماشینی از منبع کامپایل می‌شود. اوبونتو `python3` را از
> پیش دارد، ولی اگر ایمیج کم‌حجمی استفاده می‌کنید که ندارد، `npm ci` با
> خطای `gyp ERR! find Python` شکست می‌خورد:
>
> ```bash
> sudo apt install -y build-essential python3
> ```

---

## ۲. ساخت کاربر سرویس

```bash
sudo useradd --system --create-home --home-dir /opt/ethiclens --shell /usr/sbin/nologin ethiclens
```

---

## ۳. دریافت کد

شاخه استقرار **`main`** است.

### پیش از هر چیز: گیت را روی HTTP/1.1 بگذارید

```bash
sudo git config --system http.version HTTP/1.1
```

> **چرا این خط لازم است.** روی بعضی شبکه‌ها — به‌ویژه پشت فایروال یا
> واسطه‌ای که ترافیک را بازرسی می‌کند — درخواست‌های HTTP/2 گیت نیمه‌کاره
> می‌رسند. الگویش گمراه‌کننده است:
>
> ```
> GET  /info/refs        → 200   (اتصال تازه، سالم می‌رسد)
> POST /git-upload-pack  → 401   (روی همان اتصال، جریان دوم — خراب می‌رسد)
> ```
>
> گیت‌هاب درخواست ناقص را رد می‌کند، گیت آن ۴۰۱ را «رمز می‌خواهد» تعبیر
> می‌کند و نام کاربری می‌پرسد. نتیجه این است که ساعت‌ها دنبال توکن و
> اعتبارنامه می‌گردید در حالی که مسئله اصلاً دسترسی نیست — مخزن عمومی است
> و `curl` همان نشانی را بی‌مشکل می‌گیرد.
>
> `--system` در `/etc/gitconfig` می‌نویسد، پس برای همه کاربران و همه
> مخزن‌ها اعمال می‌شود. `--global` اینجا کار نمی‌کند: `sudo -u` متغیر
> `HOME` را عوض نمی‌کند، پس تنظیم در خانه کاربر اشتباه می‌نشیند.
>
> اگر شبکه‌تان سالم است این خط ضرری ندارد — فقط HTTP/1.1 به‌جای HTTP/2.

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

سپس نصب وابستگی‌ها و ساخت رابط کاربری:

```bash
cd /opt/ethiclens && sudo -u ethiclens npm ci && sudo -u ethiclens npm run build && sudo -u ethiclens mkdir -p /opt/ethiclens/data
```

> **چرا `npm ci` کامل و نه `--omit=dev`:** رابط کاربری یک بسته React است
> که باید همین‌جا ساخته شود، و ابزار ساختش در devDependencies است.
>
> ساختن روی سرور به‌جای کامیت‌کردن بسته آماده، یک انتخاب آگاهانه است. بسته
> کامیت‌شده می‌تواند بی‌صدا از کد عقب بیفتد — کسی کد را پوش می‌کند بدون
> اینکه دوباره بسازد، و سایت همچنان نسخه قدیمی را سرو می‌کند بی‌آنکه هیچ
> خطایی جایی دیده شود. ساختی که اینجا شکست بخورد، اسکریپت را متوقف می‌کند
> و می‌گوید.
>
> ساخت در `client-dist.next` انجام می‌شود و فقط در صورت موفقیت جای نسخه
> زنده را می‌گیرد، پس شکست وسط کار، نسخه در حال اجرا را از بین نمی‌برد.

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

**گواهی را پیش از این گام نصب کنید.** nginx اگر فایل گواهی را پیدا نکند
اصلاً بالا نمی‌آید و کلادفلر خطای ۵۲۱ می‌دهد.

```bash
sudo cp /opt/ethiclens/deploy/cloudflare-realip.conf /etc/nginx/cloudflare-realip.conf
sudo cp /opt/ethiclens/deploy/nginx.conf /etc/nginx/sites-available/ethiclens
sudo ln -sf /etc/nginx/sites-available/ethiclens /etc/nginx/sites-enabled/ethiclens
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

> `ln -sf` می‌گذارد اجرای دوباره این گام بی‌خطر باشد؛ با `ln -s` ساده،
> بار دوم خطای `File exists` می‌گیرید.

اگر `nginx -t` خطای `unknown directive "http2"` داد، نسخه nginx شما قدیمی‌تر
از 1.25.1 است و فایل `deploy/nginx.conf` را از مخزن تازه نکرده‌اید — با
`git pull origin main` به‌روزش کنید. نسخه را با `nginx -v` ببینید.

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

CF="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4; echo; curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)"
COUNT="$(echo "$CF" | grep -c '/')"

if [ "$COUNT" -lt 10 ]; then
  echo "خطا: فقط $COUNT بازه گرفته شد. فایروال دست‌نخورده ماند."
else
  for ip in $CF; do sudo ufw allow proto tcp from "$ip" to any port 443; done
  echo "$COUNT بازه اجازه گرفت."
fi
```

سپس بررسی کنید که قواعد ۴۴۳ واقعاً ساخته شده‌اند و بعد فایروال را روشن کنید:

```bash
sudo ufw status | grep -c 443
sudo ufw enable
```

> **این ترتیب مهم است.** اگر گرفتن بازه‌ها شکست بخورد — نبود دسترسی
> خروجی، اشکال DNS، هر چیزی — حلقه هیچ قاعده‌ای نمی‌سازد ولی `ufw enable`
> باز هم اجرا می‌شود و شما را با فایروالی رها می‌کند که فقط SSH را
> می‌پذیرد. سایت بالا می‌ماند ولی کلادفلر به آن نمی‌رسد و خطای ۵۲۱
> می‌دهد. شمارش پیش از روشن‌کردن، همین را می‌گیرد.

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

## ۹. ارسال ایمیل از سرور خودتان (اختیاری)

این بخش فقط وقتی لازم است که بخواهید ایمیل تأیید و بازیابی رمز را به‌جای
Brevo از سرور خودتان بفرستید. تا وقتی سرویس ایمیل تنظیم نشده، ثبت‌نام و
تأیید مدیر مثل همیشه کار می‌کنند؛ فقط کد ثبت‌نام و بازیابی رمز غیرفعال‌اند.

> **پیش از هر کاری این را بخوانید.** کد بخش آسان ماجراست. رساندن ایمیل از
> یک سرور تازه به جی‌میل و اوت‌لوک به چهار چیز بستگی دارد که هیچ‌کدام در
> این پروژه نیست: باز بودن پورت ۲۵ خروجی، رکورد معکوس (PTR)، امضای DKIM،
> و اعتبار IP. اگر IP سرور در فهرست‌های سیاه باشد — که برای بازه‌های
> ایرانی رایج است — ممکن است هیچ‌کدام از این کارها کافی نباشد.
>
> اینها دقیقاً ایمیل‌هایی هستند که **باید** برسند. تا وقتی گام ۹.۷ سبز
> نشده، کلید «کد تأیید ثبت‌نام» را در پنل مدیریت روشن نکنید.

### ۹.۱ اول از همه: آیا پورت ۲۵ اصلاً باز است؟

بسیاری از ارائه‌دهندگان سرور، پورت ۲۵ خروجی را پیش‌فرض می‌بندند. اگر بسته
باشد هیچ‌کدام از گام‌های بعدی فایده ندارد:

```bash
timeout 8 bash -c 'cat < /dev/null > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo "باز است ✅" || echo "بسته است ❌"
```

اگر بسته بود، از پشتیبانی سرور بخواهید بازش کنند. بعضی ارائه‌دهندگان اصلاً
باز نمی‌کنند؛ در آن صورت این مسیر برای شما بسته است و باید روی Brevo
بمانید.

### ۹.۲ نصب Postfix به‌صورت فقط‌ارسال

```bash
sudo apt update && sudo apt install -y postfix mailutils
```

در پرسش نصب، **Internet Site** را انتخاب کنید و برای «System mail name»
مقدار `ethiclens.ir` را بگذارید.

سپس آن را طوری تنظیم کنید که فقط از روی خود سرور قابل استفاده باشد:

```bash
sudo postconf -e 'inet_interfaces = loopback-only'
sudo postconf -e 'myhostname = mail.ethiclens.ir'
sudo postconf -e 'mydestination = localhost'
sudo postconf -e 'smtp_tls_security_level = may'
sudo postconf -e 'smtpd_tls_security_level = may'
sudo systemctl restart postfix
```

> `inet_interfaces = loopback-only` مهم‌ترین خط اینجاست. بدون آن، Postfix
> روی اینترنت گوش می‌دهد و اگر تنظیمات رله اشتباه باشد سرور شما تبدیل به
> رله باز می‌شود — یعنی هرزنامه‌نویس‌ها از آن استفاده می‌کنند و IP شما
> ظرف چند ساعت در فهرست سیاه می‌رود.

آزمایش محلی:

```bash
echo "متن آزمایشی" | mail -s "آزمون Postfix" your-address@gmail.com
sudo tail -f /var/log/mail.log
```

### ۹.۳ رکورد معکوس (PTR)

نام معکوس IP سرور باید با `myhostname` یکی باشد. این را **فقط ارائه‌دهنده
سرور** می‌تواند تنظیم کند — در پنل مدیریت سرور دنبال «Reverse DNS» یا
«PTR» بگردید و مقدار `mail.ethiclens.ir` را بگذارید.

بررسی:

```bash
dig -x $(curl -fsS https://api.ipify.org) +short
```

خروجی باید `mail.ethiclens.ir.` باشد. اگر نام ارائه‌دهنده را برگرداند،
جی‌میل احتمال زیادی دارد پیام را رد کند.

یک رکورد A هم برای همان نام لازم است. **این یکی باید ابر خاکستری باشد**،
نه نارنجی — اگر از کلادفلر رد شود، IP واقعی سرور پنهان می‌ماند و PTR با
آنچه گیرنده می‌بیند نمی‌خواند:

| نوع | نام | مقدار | وضعیت |
|---|---|---|---|
| A | `mail` | IP سرور | ☁️ خاکستری (DNS only) |

### ۹.۴ رکورد SPF

اعلام می‌کند کدام سرورها حق دارند از طرف دامنه شما ایمیل بفرستند. در
کلادفلر یک رکورد TXT روی دامنه اصلی بسازید:

```
v=spf1 ip4:<IP سرور> -all
```

`-all` یعنی «هیچ سرور دیگری مجاز نیست». اگر همزمان از Brevo هم استفاده
می‌کنید، بخش آن را اضافه کنید وگرنه ایمیل‌های Brevo رد می‌شوند:

```
v=spf1 ip4:<IP سرور> include:spf.brevo.com -all
```

### ۹.۵ امضای DKIM

طولانی‌ترین گام، و همانی که بیشترین اثر را روی نرسیدن به اسپم دارد.

```bash
sudo apt install -y opendkim opendkim-tools
sudo mkdir -p /etc/opendkim/keys/ethiclens.ir
sudo opendkim-genkey -b 2048 -d ethiclens.ir -D /etc/opendkim/keys/ethiclens.ir -s mail -v
sudo chown -R opendkim:opendkim /etc/opendkim
sudo chmod 600 /etc/opendkim/keys/ethiclens.ir/mail.private
```

پیکربندی:

```bash
sudo tee -a /etc/opendkim.conf > /dev/null <<'CONF'
Canonicalization   relaxed/simple
Mode               sv
SubDomains         no
Socket             inet:8891@localhost
KeyTable           /etc/opendkim/key.table
SigningTable       refile:/etc/opendkim/signing.table
InternalHosts      127.0.0.1, ::1, localhost
CONF

echo "mail._domainkey.ethiclens.ir ethiclens.ir:mail:/etc/opendkim/keys/ethiclens.ir/mail.private" \
  | sudo tee /etc/opendkim/key.table
echo "*@ethiclens.ir mail._domainkey.ethiclens.ir" \
  | sudo tee /etc/opendkim/signing.table
```

وصل‌کردن به Postfix:

```bash
sudo postconf -e 'milter_protocol = 6'
sudo postconf -e 'milter_default_action = accept'
sudo postconf -e 'smtpd_milters = inet:localhost:8891'
sudo postconf -e 'non_smtpd_milters = inet:localhost:8891'
sudo systemctl restart opendkim postfix
```

حالا کلید عمومی را ببینید و در کلادفلر ثبت کنید:

```bash
sudo cat /etc/opendkim/keys/ethiclens.ir/mail.txt
```

رکورد TXT با نام `mail._domainkey` و مقداری که در پرانتزها آمده (بدون
گیومه‌ها و بدون شکستگی خط).

### ۹.۶ رکورد DMARC

رکورد TXT با نام `_dmarc`:

```
v=DMARC1; p=none; rua=mailto:postmaster@ethiclens.ir
```

با `p=none` شروع کنید. یعنی «فقط گزارش بده، چیزی را رد نکن» — تا وقتی
مطمئن شوید SPF و DKIM درست کار می‌کنند. بعداً می‌توانید به `p=quarantine`
و سپس `p=reject` برسید.

### ۹.۷ آزمون واقعی — این گام را رد نکنید

اول از پنل مدیریت تنظیم کنید:

۱. پنل مدیریت ← **ایمیل و تأیید حساب**
۲. ارائه‌دهنده: **SMTP — سرور ایمیل خودم**
۳. نشانی سرور `localhost`، پورت `25`، نام کاربری و رمز خالی
۴. ایمیل فرستنده: `no-reply@ethiclens.ir`
۵. **ذخیره**، سپس **ارسال ایمیل آزمایشی**

سپس کیفیت واقعی تحویل را بسنجید:

- به <https://www.mail-tester.com> بروید، نشانی‌ای که می‌دهد را بردارید،
  و از پنل مدیریت ایمیل آزمایشی به آن بفرستید. نمره زیر ۸ از ۱۰ یعنی
  هنوز کاری مانده.
- یک ثبت‌نام واقعی با یک آدرس جی‌میل انجام دهید و **پوشه اسپم را هم
  ببینید**. رسیدن به اسپم یعنی هنوز آماده نیست.
- بررسی فهرست سیاه: <https://mxtoolbox.com/blacklists.aspx>

فقط وقتی هر سه سبز شد، در پنل مدیریت کلید **«هنگام ثبت‌نام، کد تأیید به
ایمیل فرستاده شود»** را روشن کنید.

### ۹.۸ اگر جواب نداد

برگشتن به Brevo یک تغییر تنظیم است: پنل مدیریت ← ایمیل ← ارائه‌دهنده
**Brevo** و وارد کردن کلید. هیچ چیز دیگری لازم نیست عوض شود.

| نشانه | معنی |
|---|---|
| `Connection refused` در آزمایش | Postfix اجرا نیست: `sudo systemctl status postfix` |
| `Connection timed out` | پورت ۲۵ خروجی بسته است (گام ۹.۱) |
| ایمیل می‌رود ولی به اسپم | DKIM یا PTR ناقص است؛ mail-tester چه می‌گوید؟ |
| جی‌میل با `5.7.1` رد می‌کند | IP در فهرست سیاه است یا PTR نمی‌خواند |
| `Helo command rejected` | `myhostname` با PTR یکی نیست |
| هیچ لاگی نیست | `sudo tail -100 /var/log/mail.log` |

---

## به‌روزرسانی نسخه

### گام یک‌باره — گرفتن اسکریپت

اسکریپت به‌روزرسانی خودش بخشی از مخزن است، پس بار اول باید یک بار به روش
قدیمی بگیریدش. اگر نشانی مخزن نام کاربری دارد، همین‌جا هم اصلاحش کنید:

```bash
cd /opt/ethiclens && sudo -u ethiclens git remote set-url origin https://github.com/hamednikseresht/ethiclens.git && sudo -u ethiclens git pull origin main
```

از این پس دیگر لازم نیست این را بزنید.

### هر به‌روزرسانی بعدی

```bash
sudo bash /opt/ethiclens/deploy/update.sh
```

همین. اسکریپت نشانی مخزن را می‌سنجد و در صورت نیاز اصلاح می‌کند، کد را
می‌گیرد، وابستگی‌ها را نصب می‌کند، سرویس را ری‌استارت می‌کند و در پایان
بررسی می‌کند که واقعاً بالا آمده باشد. روی اولین خطا متوقف می‌شود.

### خروجی موفق چه شکلی است

```
▸ بررسی نشانی مخزن
  ✓ https://github.com/hamednikseresht/ethiclens.git

▸ دریافت کد از شاخه main
  ✓ bda7095 → c4f1e28
    c4f1e28 عنوان کامیت تازه

▸ نصب وابستگی‌ها
  ✓ نصب شد

▸ راه‌اندازی دوباره سرویس
  ✓ ethiclens در حال اجراست
  ✓ پاسخ سلامت گرفته شد

  به‌روزرسانی کامل شد.
```

اگر «از قبل به‌روز بود» دیدید یعنی چیزی برای گرفتن نبود — نه خطا.

### اگر جایی متوقف شد

| پیام | معنی و کار |
|---|---|
| `HTTP 401` یا درخواست نام کاربری | معمولاً مشکل دسترسی نیست: HTTP/2 روی این شبکه خراب است. `sudo git config --system http.version HTTP/1.1` را بزنید. اگر مخزن واقعاً خصوصی است، Personal Access Token لازم دارید |
| `دریافت کد ناموفق بود` با پیام تعارض | روی سرور تغییر محلی داده‌اید. با `sudo -u ethiclens git -C /opt/ethiclens status` ببینید چیست |
| `package-lock.json نیست` | فایل‌ها ناقص کپی شده‌اند — بخش ۳ را دوباره ببینید |
| `سرویس بالا نیامد` | اسکریپت ۲۵ خط آخر ژورنال را چاپ می‌کند؛ معمولاً خطای مهاجرت یا `.env` است |
| `به /api/health پاسخ نداد` | سرویس اجراست ولی مشکلی دارد: `sudo journalctl -u ethiclens -n 50 --no-pager` |

### برگشت به نسخه قبل

اگر به‌روزرسانی چیزی را شکست، به کامیت قبلی برگردید:

```bash
cd /opt/ethiclens && sudo -u ethiclens git log --oneline -5
```

شناسه کامیت سالم را بردارید و:

```bash
cd /opt/ethiclens && sudo -u ethiclens git checkout <شناسه> && sudo -u ethiclens npm ci --omit=dev && sudo systemctl restart ethiclens
```

برای برگشت به آخرین نسخه: `sudo -u ethiclens git checkout main`.

> **پایگاه داده برنمی‌گردد.** جدول‌ها و ستون‌های تازه سرِ جایشان می‌مانند.
> این معمولاً بی‌خطر است چون کد قدیمی ستون‌های تازه را نادیده می‌گیرد، ولی
> پیش از هر به‌روزرسانی مهم، از پایگاه داده پشتیبان بگیرید (بخش بعدی).

### نکته‌ها

جدول‌ها با `CREATE TABLE IF NOT EXISTS` ساخته و ستون‌های تازه با `ALTER`
افزوده می‌شوند، پس به‌روزرسانی داده‌ای را پاک نمی‌کند.

تنظیماتی که از پنل مدیریت وارد کرده‌اید — کلیدهای API، سرویس ایمیل، متن
دانشنامه، دسته‌بندی‌ها — در پایگاه داده‌اند نه در کد، پس به‌روزرسانی به
آن‌ها دست نمی‌زند.

اگر ترجیح می‌دهید دستی بزنید، حتماً با `&&` زنجیر کنید تا شکست هر گام
جلوی بقیه را بگیرد:

```bash
cd /opt/ethiclens && sudo -u ethiclens git pull origin main && sudo -u ethiclens npm ci --omit=dev && sudo systemctl restart ethiclens
```

> **چرا زنجیرکردن مهم است:** اگر گام‌ها را در خطوط جدا بزنید، شکست
> `git pull` جلوی `npm ci` و ری‌استارت را نمی‌گیرد. خروجی پر از پیام
> موفقیت می‌شود — «۷۹ پکیج نصب شد»، «found 0 vulnerabilities» — در حالی
> که کد اصلاً عوض نشده. این حالت دو بار پیش آمده و هر بار شبیه موفقیت
> بوده است.

---

## پشتیبان‌گیری

کل وضعیت برنامه در یک پوشه است: `/opt/ethiclens/data`.

```bash
sudo -u ethiclens sqlite3 /opt/ethiclens/data/ethiclens.db ".backup '/opt/ethiclens/data/backup-$(date +%F).db'"
```

> اگر `sqlite3: command not found` گرفتید، در بخش ۱ نصبش نکرده‌اید:
> `sudo apt install -y sqlite3`
>
> `.backup` عمداً به‌جای `cp` استفاده می‌شود. پایگاه داده در حالت WAL کار
> می‌کند، یعنی بخشی از نوشته‌ها در فایل جانبی `-wal` است و کپی ساده فایل
> اصلی می‌تواند نسخه‌ای نیم‌بند بدهد. `.backup` از API خود SQLite استفاده
> می‌کند و روی پایگاه داده‌ای که سرویس در حال استفاده از آن است هم امن است
> — لازم نیست سرویس را متوقف کنید.

پشتیبان‌گیری روزانه. `deploy/backup.sh` را به‌جای یک دستور دستی اجرا کنید:
خودش تشخیص می‌دهد کدام فایل پایگاه داده زنده است (server/db.js بین
`ethica.db` و `ethiclens.db` انتخاب می‌کند)، پس از ساخت پشتیبان
`integrity_check` می‌گیرد، فشرده می‌کند و نسخه‌های قدیمی‌تر از ۳۰ روز را
پاک می‌کند.

**راه پیشنهادی — تایمر systemd:**

```bash
sudo cp /opt/ethiclens/deploy/ethiclens-backup.service /etc/systemd/system/
sudo cp /opt/ethiclens/deploy/ethiclens-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ethiclens-backup.timer
systemctl list-timers ethiclens-backup
```

> تایمر با `Persistent=true` کار می‌کند، یعنی اگر سرور ساعت ۳:۴۰ خاموش
> بوده باشد پشتیبان را هنگام بالا آمدن می‌گیرد نه اینکه آن روز را رد کند —
> و همان روز است که بیشتر به پشتیبان نیاز دارید.

یک بار هم دستی اجرا کنید تا مطمئن شوید کار می‌کند:

```bash
sudo bash /opt/ethiclens/deploy/backup.sh
```

**یا با cron، اگر systemd را ترجیح نمی‌دهید:**

```bash
sudo crontab -e
```

```cron
0 3 * * * bash /opt/ethiclens/deploy/backup.sh >> /var/log/ethiclens-backup.log 2>&1
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
| کد تأیید ثبت‌نام نمی‌رسد | مسیر ارسال ایمیل تنظیم نشده — پنل مدیریت ← ایمیل، و بخش ۹ |
| «رمزم را فراموش کرده‌ام» دیده نمی‌شود | همان مورد بالا؛ این پیوند فقط وقتی ایمیل تنظیم باشد نمایش داده می‌شود |
| ایمیل به پوشه اسپم می‌رود | DKIM یا PTR ناقص است — بخش ۹.۵ و ۹.۳ |
| `git pull` رمز می‌خواهد و ۴۰۱ می‌دهد | HTTP/2 روی شبکه سرور خراب است — `sudo git config --system http.version HTTP/1.1` (بخش ۳). `update.sh` خودش این را تشخیص می‌دهد |
| به‌روزرسانی زدید ولی چیزی عوض نشد | گام‌ها را جدا زده‌اید و `git pull` بی‌صدا شکست خورده؛ از `update.sh` استفاده کنید |
| `sqlite3: command not found` | در بخش ۱ نصب نشده — `sudo apt install -y sqlite3` |
