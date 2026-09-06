# Deploying with Docker

An alternative to [`DEPLOY.md`](DEPLOY.md). Same application, same database,
same nginx in front — only the way the process is installed and updated
changes.

The container publishes on `127.0.0.1:3000`, exactly where the systemd service
listened, so **the host's nginx, the Cloudflare origin certificate and the
firewall rules keep working untouched**. Moving to Docker is a swap of the
process manager, not of the architecture.

---

## What is in the image

Two stages, both on `node:22-bookworm-slim`:

| Stage | Does |
|---|---|
| `builder` | installs every dependency, compiles `better-sqlite3`, builds the Vite bundle, then prunes to production packages |
| `runtime` | copies the pruned `node_modules`, the built `client-dist` and the server source |

Both stages use the same Debian base on purpose. `better-sqlite3` publishes no
prebuilt binaries, so it is compiled during the build, and a `.node` file
compiled against glibc will not load on a musl runtime.

The frontend is built inside the image rather than committed to the
repository, for the same reason `update.sh` builds on the server: a committed
bundle drifts silently when someone pushes source without rebuilding, while a
build that fails here fails the image.

The container runs as the unprivileged `node` user and writes to exactly one
place — `/data`, the volume. The application code is owned by root and is
read-only to the process.

---

## First install

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
```

Or Docker's own repository if you want a newer engine — either works.

```bash
sudo git clone https://github.com/hamednikseresht/ethiclens.git /opt/ethiclens
cd /opt/ethiclens
sudo cp .env.example .env
sudo nano .env
```

Fill in at least:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | output of `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the first admin account |
| `SECURE_COOKIE` | `1` (you are behind HTTPS) |
| one provider key | `NVIDIA_API_KEY`, `OPENAI_API_KEY`, … |

`NODE_ENV`, `DB_PATH` and `TRUST_PROXY` are set by compose and do not need to
be right in `.env` — the file is shared with the bare-metal install, where
`DB_PATH` points at `./data`, and inside the container that path has nothing
mounted on it.

```bash
sudo chmod 600 .env
sudo docker compose up -d --build
sudo docker compose logs -f app
```

The first boot creates the schema, seeds the encyclopedia and the models, and
creates the admin account. Then point nginx at it exactly as
[`DEPLOY.md` section 6.5](DEPLOY.md#65-install-the-nginx-configuration)
describes — nothing about that step changes.

---

## Updating

```bash
sudo bash /opt/ethiclens/deploy/docker-update.sh
```

It backs up the database, pulls, builds a new image, replaces the container
and waits for the health check to pass. It stops on the first failure, and
the build happens before anything is stopped — so a broken build leaves the
old container running and serving.

`BRANCH` defaults to the branch checked out on the server. To deploy another:

```bash
sudo BRANCH=some-branch bash /opt/ethiclens/deploy/docker-update.sh
```

By hand, if you prefer — chained with `&&` so a failure stops the rest:

```bash
cd /opt/ethiclens && sudo git pull && sudo docker compose up -d --build
```

---

## Moving an existing install onto Docker

The database is a file; nothing is converted. Stop the old service first so
nothing is mid-write, and checkpoint the WAL so everything is in the `.db`:

```bash
sudo systemctl stop ethiclens
sudo systemctl disable ethiclens

cd /opt/ethiclens
sudo sqlite3 data/ethiclens.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

> If your file is named `data/ethica.db` — older installs are — use that name
> above. It still has to land in the volume as `ethiclens.db`, because
> `DB_PATH` in compose names that file.

Create the volume and copy the database in, owned by uid 1000, which is the
`node` user inside the container:

```bash
sudo docker volume create ethiclens_data

sudo docker run --rm \
  -v ethiclens_data:/data \
  -v /opt/ethiclens/data:/src:ro \
  alpine sh -c 'cp /src/ethiclens.db /data/ethiclens.db && chown 1000:1000 /data/ethiclens.db'

sudo docker compose up -d --build
sudo docker compose logs -f app
```

Check the admin panel afterwards: the users, the analyses, the encyclopedia
edits and the API keys should all be there. The old `data/` directory on the
host is untouched — keep it until you are satisfied, then archive it.

---

## Backups

```bash
sudo bash /opt/ethiclens/deploy/docker-backup.sh
```

Writes a gzipped copy to `/opt/ethiclens/backups` and prunes anything older
than 30 days. It runs `sqlite3 .backup` inside the container rather than
copying the file: in WAL mode part of what has been written lives in a
separate `-wal` file, and a plain copy can catch the database mid-transaction.
`.backup` uses SQLite's own API and is safe against a database the app is
using, so nothing has to be stopped.

Daily, from the host's crontab:

```cron
0 3 * * * bash /opt/ethiclens/deploy/docker-backup.sh >> /var/log/ethiclens-backup.log 2>&1
```

To restore, put the file back the way the migration section copies one in.

---

## Running nginx in Docker too

Only for a host with no nginx of its own — two processes cannot both hold
port 443.

```bash
sudo docker compose --profile nginx up -d
```

It mounts `deploy/nginx.conf`, `deploy/cloudflare-realip.conf` and
`/etc/ssl/cloudflare` read-only. The certificates still have to exist on the
host; see [`DEPLOY.md` section 6.2](DEPLOY.md#62-the-origin-certificate).

If nginx is already installed and working on the host, leave this profile
alone. It has the certificates and the real-IP include already, and swapping
a working TLS terminator for a containerised one gains nothing.

---

## Everyday commands

| Command | Does |
|---|---|
| `docker compose ps` | is it running, and is it healthy |
| `docker compose logs -f app` | follow the log |
| `docker compose restart app` | restart without rebuilding |
| `docker compose down` | stop and remove the container — **the volume survives** |
| `docker compose exec app sh` | a shell inside the container |
| `docker compose exec app sqlite3 /data/ethiclens.db` | the database directly |

`docker compose down -v` deletes the volume and with it the entire database.
There is no undo. It is never part of an update.

---

## Rolling back

Images are tagged `ethiclens:latest` on every build, so the previous one is
untagged rather than kept. Roll back through git and rebuild:

```bash
cd /opt/ethiclens
sudo git log --oneline -5
sudo git checkout <commit>
sudo docker compose up -d --build
```

> **The database does not roll back.** New tables and columns stay. That is
> usually harmless — older code ignores newer columns — but restore a backup
> as well if a migration is what went wrong.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Build fails at `npm ci` on `better-sqlite3` | the builder stage needs `python3 make g++`; they are installed there, so a failure here usually means no network during build |
| Container restarts in a loop | `docker compose logs --tail 50 app` — usually `.env` or a migration |
| `SQLITE_READONLY` | the volume is not owned by uid 1000: `docker run --rm -v ethiclens_data:/data alpine chown -R 1000:1000 /data` |
| Health check never turns healthy | `docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>console.log(r.status))"` |
| Cloudflare 521 | the container is up but nginx cannot reach it — confirm the port is published on `127.0.0.1:3000` with `docker compose ps` |
| Every user shares one IP | `TRUST_PROXY=1` is set by compose; the missing piece is `cloudflare-realip.conf` on nginx, as in `DEPLOY.md` section 6.5 |
| Data seems gone after `down` | it is not — the volume is separate. `docker volume ls` and `docker compose up -d` |
| Disk filling up | `docker image prune -f`; `docker-update.sh` does this on every run |
