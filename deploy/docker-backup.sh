#!/usr/bin/env bash
#
# Back up the database out of the Docker volume.
#
#   bash /opt/ethiclens/deploy/docker-backup.sh
#
# Daily, from the host's crontab:
#   0 3 * * * bash /opt/ethiclens/deploy/docker-backup.sh >> /var/log/ethiclens-backup.log 2>&1
#
# Runs sqlite3's .backup inside the running container rather than copying the
# file from the volume. The database is in WAL mode, so part of what has been
# written lives in a separate -wal file and a plain copy of the .db can catch
# it mid-transaction. .backup uses SQLite's own API and is safe against a
# database the app is actively using, so nothing has to be stopped.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ethiclens}"
DEST="${DEST:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

say()  { printf '\n\033[1m> %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m %s\n' "$*"; }
die()  { printf '\n  \033[31mFAILED: %s\033[0m\n\n' "$*" >&2; exit 1; }

cd "$APP_DIR"
command -v docker >/dev/null || die "docker is not installed."

CID="$(docker compose ps -q app || true)"
[ -n "$CID" ] || die "the app container is not running."

mkdir -p "$DEST"
STAMP="$(date +%F-%H%M)"
OUT="$DEST/ethiclens-$STAMP.db"

say "Backing up"

# Written to /tmp inside the container first: /data holds the live database
# and writing the copy beside it would put a second full-size file on the
# volume every night.
docker compose exec -T app sh -c \
  'sqlite3 "$DB_PATH" ".backup /tmp/backup.db" && sqlite3 /tmp/backup.db "PRAGMA integrity_check;"' \
  | grep -qx 'ok' || die "the copy was made but failed its integrity check."

docker compose cp "app:/tmp/backup.db" "$OUT" || die "could not copy the backup out of the container."
docker compose exec -T app rm -f /tmp/backup.db || true

gzip -f "$OUT"
ok "$OUT.gz  ($(du -h "$OUT.gz" | cut -f1))"

# ---------------------------------------------------------------------------
say "Pruning old backups"

find "$DEST" -name 'ethiclens-*.db.gz' -mtime "+$KEEP_DAYS" -print -delete \
  | sed 's/^/  - removed: /'
ok "$(find "$DEST" -name 'ethiclens-*.db.gz' | wc -l) backup(s) kept ($KEEP_DAYS days)"
