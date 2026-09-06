# Deploying on an Ubuntu server

Step by step, for running Ethic Lens on Ubuntu 22.04 / 24.04 behind nginx and
Cloudflare, with an Origin certificate and Full (strict) mode.

> **Already installed and only updating?** Go straight to
> [Updating](#updating) — it is one command:
> `sudo bash /opt/ethiclens/deploy/update.sh`

---

## 1. Prerequisites

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx build-essential python3 sqlite3
```

Install Node.js 22 (LTS):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

> **`build-essential` and `python3` are genuinely required, not optional.**
> `better-sqlite3@13` publishes no prebuilt binaries (its release has zero
> files), so it compiles from source on every machine. Ubuntu ships `python3`
> already, but on a slim image without it `npm ci` fails with
> `gyp ERR! find Python`:
>
> ```bash
> sudo apt install -y build-essential python3
> ```

---

## 2. Create the service user

```bash
sudo useradd --system --create-home --home-dir /opt/ethiclens --shell /usr/sbin/nologin ethiclens
```

---

## 3. Get the code

Set `BRANCH` below to the branch you deploy.

### First of all: put git on HTTP/1.1

```bash
sudo git config --system http.version HTTP/1.1
```

> **Why this line is needed.** On some networks — particularly behind a
> firewall or a proxy that inspects traffic — git's HTTP/2 requests arrive
> damaged. The pattern is misleading:
>
> ```
> GET  /info/refs        -> 200   (fresh connection, arrives intact)
> POST /git-upload-pack  -> 401   (second stream on the same connection, damaged)
> ```
>
> GitHub rejects the malformed request, git reads that 401 as "wants a
> password" and asks for a username. The result is hours spent hunting for
> tokens and credentials when access was never the problem — the repository is
> public and `curl` fetches the same URL without trouble.
>
> `--system` writes to `/etc/gitconfig`, so it applies to every user and every
> repository. `--global` does not work here: `sudo -u` does not change `HOME`,
> so the setting lands in the wrong home directory.
>
> On a healthy network this line costs nothing — just HTTP/1.1 over HTTP/2.

The previous step created `/opt/ethiclens` as the service user's home, so the
directory is **not empty** and `git clone` into it fails:

```
fatal: destination path '/opt/ethiclens' already exists and is not an empty directory
```

Clone into a temporary directory and move the contents in instead:

```bash
BRANCH=main
sudo -u ethiclens git clone -b "$BRANCH" https://github.com/hamednikseresht/ethiclens.git /tmp/ethiclens-src
sudo -u ethiclens cp -a /tmp/ethiclens-src/. /opt/ethiclens/
sudo -u ethiclens git -C /opt/ethiclens remote -v
rm -rf /tmp/ethiclens-src
```

Then install dependencies and build the frontend:

```bash
cd /opt/ethiclens && sudo -u ethiclens npm ci && sudo -u ethiclens npm run build && sudo -u ethiclens mkdir -p /opt/ethiclens/data
```

> **Why the full `npm ci` and not `--omit=dev`:** the frontend is a React
> bundle that has to be built here, and its toolchain lives in
> devDependencies.
>
> Building on the server rather than committing a built bundle is a deliberate
> choice. A committed bundle can fall silently out of step with the source —
> someone pushes code without rebuilding, and the site keeps serving the old
> app with no error anywhere. A build that fails here stops the script and
> says so.
>
> The build goes to `client-dist.next` and only replaces the live bundle on
> success, so a failure partway through does not destroy the running version.

> **If `npm ci` says `package-lock.json` is missing**, the step above was
> incomplete and the files were not fully copied. Check with
> `ls /opt/ethiclens` that `package.json`, `package-lock.json` and the
> `server/` directory are all present.
>
> **Do not** use `npm install` instead of `npm ci`: it re-resolves versions and
> installs a different tree from the one that was tested. `better-sqlite3` has
> a native binary, and a silent version jump in it fails at runtime rather than
> at install time. Get the lock file in place and stay on `npm ci`.

> If `npm ci` warns about the `better-sqlite3` install script, install with
> `sudo -u ethiclens npm install --omit=dev --foreground-scripts`.

---

## 4. Environment variables

```bash
sudo -u ethiclens cp /opt/ethiclens/.env.example /opt/ethiclens/.env
sudo -u ethiclens nano /opt/ethiclens/.env
```

Values that **must** be changed:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | the output of `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the first admin account |
| `TRUST_PROXY` | `1` — otherwise every user's IP looks like nginx's own |
| `SECURE_COOKIE` | `1` (you are behind HTTPS) |
| `NODE_ENV` | `production` |

Service keys — at least one is required:

| Variable | Meaning |
|---|---|
| `NVIDIA_API_KEY` | an `nvapi-…` key |
| `OPENAI_API_KEY` | an `sk-…` key |
| `BREVO_API_KEY` | the default mail service, for account verification email |
| `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` | only if you use Mailgun instead of Brevo |
| `MAILGUN_BASE_URL` | European account: `https://api.eu.mailgun.net` |

> These are for **first boot only**. Once the service is up, every key and
> provider is configurable from the admin panel and stored in the database. A
> provider with no key is created but stays switched off.

**Do not forget the site URL.** After the first sign-in, go to admin → site
settings and set `site_url` to `https://ethiclens.ir`. Verification email
links, the `canonical` on every public page and the sitemap are all built from
it; left empty, the `Host` header is used, which behind a proxy can be wrong.

Then restrict the file — it holds API keys:

```bash
sudo chmod 600 /opt/ethiclens/.env
sudo chown ethiclens:ethiclens /opt/ethiclens/.env
```

---

## 5. The systemd service

```bash
sudo cp /opt/ethiclens/deploy/ethiclens.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ethiclens
sudo systemctl status ethiclens
```

Follow the log live:

```bash
sudo journalctl -u ethiclens -f
```

---

## 6. Cloudflare — DNS and SSL

The finished architecture has three hops:

```
visitor ──public TLS──▶ Cloudflare ──Origin-cert TLS──▶ nginx ──local HTTP──▶ the app
```

### 6.1 Add the domain and the records

Add `ethiclens.ir` in the Cloudflare dashboard, then set the nameservers it
gives you at your registrar. Create two records:

| Type | Name | Value | State |
|---|---|---|---|
| A | `ethiclens.ir` | the server's IP | Proxied (orange) |
| A | `www` | the server's IP | Proxied (orange) |

The cloud must be **orange**. Left grey, Cloudflare provides DNS only — no
certificate, no protection, and the server's address is not hidden.

### 6.2 The Origin certificate

Under **SSL/TLS → Origin Server → Create Certificate**, create one (the
defaults are fine: RSA, 15 years, covering `ethiclens.ir` and
`*.ethiclens.ir`). It gives you two blocks of text. On the server:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/ethiclens.ir.pem   # the Origin Certificate block
sudo nano /etc/ssl/cloudflare/ethiclens.ir.key   # the Private Key block
sudo chmod 600 /etc/ssl/cloudflare/ethiclens.ir.key
sudo chmod 644 /etc/ssl/cloudflare/ethiclens.ir.pem
```

> The private key is shown once. If you close the page without saving it, you
> have to create a new certificate.

Only Cloudflare considers this certificate valid, which is enough, because only
Cloudflare talks to the server directly. It lasts 15 years, so unlike Let's
Encrypt it needs no renewal job.

### 6.3 SSL mode

Under **SSL/TLS → Overview**, set the mode to **Full (strict)**.

| Mode | What it does | Suitable? |
|---|---|---|
| Flexible | Cloudflare does not encrypt to the origin | No — creates a redirect loop and leaves traffic in the clear |
| Full | encrypted, certificate not verified | Risky — open to a man in the middle |
| **Full (strict)** | encrypted and verified | Yes — choose this |

Turn on **Always Use HTTPS** as well.

### 6.4 A cache rule for the API paths

Cloudflare must not cache API responses. Under **Caching → Cache Rules**,
create a rule:

- **If** `URI Path` starts with `/api/`
- **Then** `Bypass cache`

### 6.5 Install the nginx configuration

**Install the certificate before this step.** If nginx cannot find the
certificate file it will not start at all, and Cloudflare returns error 521.

```bash
sudo cp /opt/ethiclens/deploy/cloudflare-realip.conf /etc/nginx/cloudflare-realip.conf
sudo cp /opt/ethiclens/deploy/nginx.conf /etc/nginx/sites-available/ethiclens
sudo ln -sf /etc/nginx/sites-available/ethiclens /etc/nginx/sites-enabled/ethiclens
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

> `ln -sf` makes re-running this step safe; with a plain `ln -s` the second run
> fails with `File exists`.

If `nginx -t` reports `unknown directive "http2"`, your nginx is older than
1.25.1 and you have not refreshed `deploy/nginx.conf` from the repository —
update it with `git pull`. Check the version with `nginx -v`.

Refresh the Cloudflare ranges, and repeat monthly:

```bash
sudo bash /opt/ethiclens/deploy/update-cloudflare-ips.sh
```

```cron
17 4 1 * * bash /opt/ethiclens/deploy/update-cloudflare-ips.sh >> /var/log/cf-ips.log 2>&1
```

> **Why `cloudflare-realip.conf` is not optional:** without it, nginx sees the
> Cloudflare edge server's address as the visitor's. The sign-in rate limiter
> in `server/routes/auth.js` keys on `req.ip` and allows 20 failures in 15
> minutes — so twenty failed attempts from anywhere in the world would lock
> sign-in for **every user**. The same applies to the registration limit.

> **About streaming:** the `location ~ ^/api/(v1/)?analyze` block must have
> `proxy_buffering off;`, or the user sees nothing until the analysis ends.
> Cloudflare also has an origin response timeout of about 100 seconds (error
> 524), but the app sends a heartbeat every 15 seconds on the stream and sets
> `no-transform` and `X-Accel-Buffering: no`, so long analyses (up to 340
> seconds) pass through without trouble.

---

## 7. Firewall — Cloudflare only

If port 443 is open to everyone, anyone who finds the server's IP can bypass
Cloudflare. Restrict inbound traffic to Cloudflare's ranges:

```bash
sudo ufw allow OpenSSH

CF="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4; echo; curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)"
COUNT="$(echo "$CF" | grep -c '/')"

if [ "$COUNT" -lt 10 ]; then
  echo "error: only $COUNT ranges fetched. The firewall was left untouched."
else
  for ip in $CF; do sudo ufw allow proto tcp from "$ip" to any port 443; done
  echo "$COUNT ranges allowed."
fi
```

Then confirm the 443 rules really exist before enabling the firewall:

```bash
sudo ufw status | grep -c 443
sudo ufw enable
```

> **This order matters.** If fetching the ranges fails — no outbound access, a
> DNS problem, anything — the loop creates no rules, but `ufw enable` still
> runs and leaves you with a firewall that accepts only SSH. The site stays up
> but Cloudflare cannot reach it and returns 521. Counting before enabling
> catches exactly that.

> Before `ufw enable`, make sure `OpenSSH` is allowed or you will lock
> yourself out.

Port 80 can stay closed, because Cloudflare redirects with **Always Use
HTTPS**. Port 3000 must never be reachable from outside — the app is available
only through nginx.

**Second layer (recommended):** turn on Authenticated Origin Pulls so nginx
verifies Cloudflare's own certificate too. The commands are commented at the
top of `deploy/nginx.conf`.

---

## 8. First sign-in

1. Go to `https://ethiclens.ir/app/login`.
2. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. Change the password **immediately** under account settings.
4. Go to `/app/admin` → models and keys, and press **test connection**.

---

## 9. Sending mail from your own server (optional)

This section is only needed if you want verification and password-reset email
to come from your own server rather than from Brevo. Until a mail service is
configured, registration and admin approval work as usual; only the sign-up
code and password reset are disabled.

> **Read this before starting.** The code is the easy part. Getting mail from a
> new server into Gmail and Outlook depends on four things, none of which live
> in this project: outbound port 25 being open, a reverse record (PTR), a DKIM
> signature, and IP reputation. If the server's IP is on blocklists — common
> for Iranian ranges — none of this may be enough.
>
> These are precisely the messages that **must** arrive. Do not switch on the
> "verification code at sign-up" setting until step 9.7 is green.

### 9.1 First: is port 25 even open?

Many hosting providers block outbound port 25 by default. If it is blocked,
none of the following steps help:

```bash
timeout 8 bash -c 'cat < /dev/null > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo "open" || echo "blocked"
```

If it is blocked, ask your provider to open it. Some never will; in that case
this route is closed to you and you should stay on Brevo.

### 9.2 Install Postfix as send-only

```bash
sudo apt update && sudo apt install -y postfix mailutils
```

At the install prompt choose **Internet Site** and set the system mail name to
`ethiclens.ir`.

Then configure it to be usable only from the server itself:

```bash
sudo postconf -e 'inet_interfaces = loopback-only'
sudo postconf -e 'myhostname = mail.ethiclens.ir'
sudo postconf -e 'mydestination = localhost'
sudo postconf -e 'smtp_tls_security_level = may'
sudo postconf -e 'smtpd_tls_security_level = may'
sudo systemctl restart postfix
```

> `inet_interfaces = loopback-only` is the most important line here. Without
> it Postfix listens on the internet, and if the relay settings are wrong your
> server becomes an open relay — spammers use it and your IP is blocklisted
> within hours.

Local test:

```bash
echo "test body" | mail -s "Postfix test" your-address@gmail.com
sudo tail -f /var/log/mail.log
```

### 9.3 The reverse record (PTR)

The reverse name of the server's IP must match `myhostname`. Only the **server
provider** can set this — look for "Reverse DNS" or "PTR" in their control
panel and set it to `mail.ethiclens.ir`.

Check:

```bash
dig -x $(curl -fsS https://api.ipify.org) +short
```

The output should be `mail.ethiclens.ir.`. If it returns the provider's own
name, Gmail is very likely to reject the message.

That name also needs an A record. **This one must be a grey cloud**, not
orange — proxied through Cloudflare it would hide the server's real IP and the
PTR would not match what the recipient sees:

| Type | Name | Value | State |
|---|---|---|---|
| A | `mail` | the server's IP | grey (DNS only) |

### 9.4 The SPF record

Declares which servers may send mail for your domain. Create a TXT record on
the apex in Cloudflare:

```
v=spf1 ip4:<server IP> -all
```

`-all` means "no other server is authorised". If you also use Brevo, include
its section or Brevo's mail will be rejected:

```
v=spf1 ip4:<server IP> include:spf.brevo.com -all
```

### 9.5 The DKIM signature

The longest step, and the one with the greatest effect on staying out of spam.

```bash
sudo apt install -y opendkim opendkim-tools
sudo mkdir -p /etc/opendkim/keys/ethiclens.ir
sudo opendkim-genkey -b 2048 -d ethiclens.ir -D /etc/opendkim/keys/ethiclens.ir -s mail -v
sudo chown -R opendkim:opendkim /etc/opendkim
sudo chmod 600 /etc/opendkim/keys/ethiclens.ir/mail.private
```

Configuration:

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

Wire it into Postfix:

```bash
sudo postconf -e 'milter_protocol = 6'
sudo postconf -e 'milter_default_action = accept'
sudo postconf -e 'smtpd_milters = inet:localhost:8891'
sudo postconf -e 'non_smtpd_milters = inet:localhost:8891'
sudo systemctl restart opendkim postfix
```

Now read the public key and publish it in Cloudflare:

```bash
sudo cat /etc/opendkim/keys/ethiclens.ir/mail.txt
```

A TXT record named `mail._domainkey` with the value inside the parentheses (no
quotes, no line breaks).

### 9.6 The DMARC record

A TXT record named `_dmarc`:

```
v=DMARC1; p=none; rua=mailto:postmaster@ethiclens.ir
```

Start with `p=none` — "report only, reject nothing" — until you are sure SPF
and DKIM work. Later you can move to `p=quarantine` and then `p=reject`.

### 9.7 The real test — do not skip this step

First, configure it in the admin panel:

1. Admin panel → **email and account verification**
2. Provider: **SMTP — my own mail server**
3. Host `localhost`, port `25`, username and password empty
4. Sender: `no-reply@ethiclens.ir`
5. **Save**, then **send a test email**

Then measure real deliverability:

- Go to <https://www.mail-tester.com>, take the address it gives you, and send
  a test message to it from the admin panel. Below 8 out of 10 means there is
  still work to do.
- Register for real with a Gmail address and **check the spam folder too**.
  Landing in spam means it is not ready.
- Blocklist check: <https://mxtoolbox.com/blacklists.aspx>

Only when all three are green, switch on **"send a verification code at
sign-up"** in the admin panel.

### 9.8 If it does not work

Going back to Brevo is one settings change: admin panel → email → provider
**Brevo**, and enter the key. Nothing else needs to change.

| Symptom | Meaning |
|---|---|
| `Connection refused` in the test | Postfix is not running: `sudo systemctl status postfix` |
| `Connection timed out` | outbound port 25 is blocked (step 9.1) |
| Mail sends but lands in spam | DKIM or PTR is incomplete; what does mail-tester say? |
| Gmail rejects with `5.7.1` | the IP is blocklisted, or the PTR does not match |
| `Helo command rejected` | `myhostname` does not match the PTR |
| No log at all | `sudo tail -100 /var/log/mail.log` |

---

## Updating

### One-time step — fetch the script

The update script is itself part of the repository, so the first time you have
to fetch it the old way. If the remote URL carries a username, fix that here
too:

```bash
cd /opt/ethiclens && sudo -u ethiclens git remote set-url origin https://github.com/hamednikseresht/ethiclens.git && sudo -u ethiclens git pull origin main
```

You will not need this again.

### Every update after that

```bash
sudo bash /opt/ethiclens/deploy/update.sh
```

That is all. The script checks the remote URL and corrects it if needed, pulls
the code, installs dependencies, builds the frontend, restarts the service and
then verifies it really came up. It stops on the first failure.

`BRANCH` defaults to whatever branch is checked out on the server, so a
deployment on a branch other than `main` needs no extra argument. To deploy a
different branch, pass it explicitly:

```bash
sudo BRANCH=some-branch bash /opt/ethiclens/deploy/update.sh
```

### What a successful run looks like

```
> Checking the remote URL
  OK https://github.com/hamednikseresht/ethiclens.git

> Pulling branch main
  OK bda7095 -> c4f1e28
    c4f1e28 the newest commit subject

> Installing dependencies
  OK installed

> Building the frontend
  OK built

> Restarting the service
  OK ethiclens is running
  OK health check passed

  Update complete.
```

"already up to date" means there was nothing to fetch — not an error.

### If it stops somewhere

| Message | Meaning and what to do |
|---|---|
| `HTTP 401`, or a username prompt | usually not an access problem: HTTP/2 is broken on this network. Run `sudo git config --system http.version HTTP/1.1`. If the repository really is private, you need a personal access token |
| `pull failed` with a conflict | you have local changes on the server. See what with `sudo -u ethiclens git -C /opt/ethiclens status` |
| `package-lock.json is missing` | the files were copied incompletely — see section 3 again |
| `the service did not come up` | the script prints the last 25 journal lines; usually a migration error or `.env` |
| `did not answer /api/health` | the service runs but something is wrong: `sudo journalctl -u ethiclens -n 50 --no-pager` |

### Rolling back

If an update breaks something, go back to the previous commit:

```bash
cd /opt/ethiclens && sudo -u ethiclens git log --oneline -5
```

Take the id of a known-good commit and:

```bash
cd /opt/ethiclens && sudo -u ethiclens git checkout <id> && sudo -u ethiclens npm ci && sudo -u ethiclens npm run build && sudo systemctl restart ethiclens
```

To return to the latest version: `sudo -u ethiclens git checkout main`.

> **The database does not roll back.** New tables and columns stay where they
> are. This is usually harmless, because older code ignores newer columns — but
> take a backup before any significant update (next section).

### Notes

Tables are created with `CREATE TABLE IF NOT EXISTS` and new columns added with
`ALTER`, so an update never destroys data.

Anything entered through the admin panel — API keys, the mail service, the
encyclopedia text, categories — lives in the database rather than the code, so
an update does not touch it.

If you prefer to run the steps by hand, chain them with `&&` so a failure stops
the rest:

```bash
cd /opt/ethiclens && sudo -u ethiclens git pull origin main && sudo -u ethiclens npm ci && sudo -u ethiclens npm run build && sudo systemctl restart ethiclens
```

> **Why chaining matters:** run on separate lines, a failed `git pull` does not
> stop `npm ci` or the restart. The output fills with success messages — "79
> packages installed", "found 0 vulnerabilities" — while the code has not
> changed at all. This has happened twice, and each time it looked like
> success.

---

## Backups

The whole application state is in one directory: `/opt/ethiclens/data`.

```bash
sudo -u ethiclens sqlite3 /opt/ethiclens/data/ethiclens.db ".backup '/opt/ethiclens/data/backup-$(date +%F).db'"
```

> If you get `sqlite3: command not found`, you skipped it in section 1:
> `sudo apt install -y sqlite3`
>
> `.backup` is used deliberately instead of `cp`. The database runs in WAL
> mode, meaning some writes live in a side `-wal` file, and a plain copy of the
> main file can produce a half-finished version. `.backup` uses SQLite's own
> API and is safe against a database the service is actively using — there is
> no need to stop the service.

Daily backups. Run `deploy/backup.sh` rather than a hand-written command: it
works out which database file is live (server/db.js chooses between
`ethica.db` and `ethiclens.db`), runs `integrity_check` on the result,
compresses it, and deletes copies older than 30 days.

**Recommended — a systemd timer:**

```bash
sudo cp /opt/ethiclens/deploy/ethiclens-backup.service /etc/systemd/system/
sudo cp /opt/ethiclens/deploy/ethiclens-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ethiclens-backup.timer
systemctl list-timers ethiclens-backup
```

> The timer uses `Persistent=true`, so if the server was down at 03:40 it takes
> the backup when it comes back rather than skipping that day — and that is
> exactly the day you are most likely to need one.

Run it once by hand to confirm it works:

```bash
sudo bash /opt/ethiclens/deploy/backup.sh
```

**Or with cron, if you would rather not use systemd:**

```bash
sudo crontab -e
```

```cron
0 3 * * * bash /opt/ethiclens/deploy/backup.sh >> /var/log/ethiclens-backup.log 2>&1
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| The service will not start | `journalctl -u ethiclens -n 50` |
| "invalid API key" error | `/app/admin` → models and keys → test connection |
| An analysis starts but no text arrives | `proxy_buffering off` in the `/api/analyze/` block |
| Signing in returns to the sign-in page | check `SECURE_COOKIE=1` and `TRUST_PROXY=1` |
| `SQLITE_READONLY` | directory ownership: `sudo chown -R ethiclens:ethiclens /opt/ethiclens/data` |
| A model returns 404 | check the model id with "fetch the account's model list" |
| `npm ci` says there is no lock file | the files were copied incompletely — see step 3 |
| Cloudflare 521 | nginx is down, or the firewall does not accept Cloudflare's ranges |
| Cloudflare 526 | Full (strict) is on but the Origin certificate is missing or its path is wrong |
| Cloudflare 524 | the response was silent for over 100 seconds — check the service |
| An endless redirect loop | SSL mode is Flexible; it must be Full (strict) |
| Every user gets locked out together | `cloudflare-realip.conf` is not installed or not included |
| Every user appears to share one address | same as above — check with `tail /var/log/nginx/ethiclens.access.log` |
| The sign-up code never arrives | no mail path configured — admin panel → email, and section 9 |
| "I forgot my password" is not shown | same as above; the link appears only when mail is configured |
| Mail lands in spam | DKIM or PTR is incomplete — sections 9.5 and 9.3 |
| `git pull` asks for a password and returns 401 | HTTP/2 is broken on the server's network — `sudo git config --system http.version HTTP/1.1` (section 3). `update.sh` detects this itself |
| You ran an update but nothing changed | the steps were run separately and `git pull` failed silently; use `update.sh` |
| `sqlite3: command not found` | not installed in section 1 — `sudo apt install -y sqlite3` |
