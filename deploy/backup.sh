#!/usr/bin/env bash
#
# Back up the database.
#
#   sudo bash /opt/ethiclens/deploy/backup.sh
#
# Everything the product knows is in one SQLite file, so this is the whole
# disaster plan. It was documented as a command to type, which means it only
# ever ran when somebody remembered — install it as a timer instead:
#
#   sudo cp /opt/ethiclens/deploy/ethiclens-backup.{service,timer} /etc/systemd/system/
#   sudo systemctl enable --now ethiclens-backup.timer
#   systemctl list-timers ethiclens-backup      # confirm the next run
#
# .backup rather than cp: the database runs in WAL mode, so at any moment
# part of the committed state is in a separate -wal file. Copying the main
# file alone can produce a backup missing the most recent writes — or a
# torn one. .backup goes through SQLite's own API and takes a consistent
# snapshot while the application keeps running.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ethiclens}"
APP_USER="${APP_USER:-ethiclens}"
DEST="${DEST:-$APP_DIR/data/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

die() { echo "  ✗ $*" >&2; exit 1; }

# Resolved the same way server/db.js resolves it, and for the same reason:
# DB_PATH wins, then a legacy ethica.db if the install still carries one,
# then the current name. Hardcoding one name backs up the wrong file on an
# older install — and the failure is silent, because a backup of a file that
# is not the live database still succeeds.
if [ -n "${DB_PATH:-}" ]; then
  DB="$DB_PATH"
elif [ -f "$APP_DIR/data/ethica.db" ]; then
  DB="$APP_DIR/data/ethica.db"
else
  DB="$APP_DIR/data/ethiclens.db"
fi

command -v sqlite3 >/dev/null || die "sqlite3 نصب نیست:  sudo apt install -y sqlite3"
[ -f "$DB" ] || die "پایگاه داده پیدا نشد: $DB"
echo "  پایگاه داده: $DB"

install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DEST"

STAMP="$(date +%F-%H%M)"
OUT="$DEST/ethiclens-$STAMP.db"

# Written as the application user so the file is not left root-owned in a
# directory the service has to keep writing to.
sudo -u "$APP_USER" sqlite3 "$DB" ".backup '$OUT'"

# A backup that cannot be opened is worse than none, because it is trusted.
# Checked here rather than on the day it is needed.
sudo -u "$APP_USER" sqlite3 "$OUT" 'PRAGMA integrity_check;' | grep -qx 'ok' \
  || die "پشتیبان ساخته شد ولی سالم نیست: $OUT"

gzip -f "$OUT"
echo "  ✓ $OUT.gz  ($(du -h "$OUT.gz" | cut -f1))"

# Old copies are removed after the retention window. -mtime only ever matches
# files this script made, because the name pattern is ours.
find "$DEST" -name 'ethiclens-*.db.gz' -type f -mtime "+$KEEP_DAYS" -print -delete \
  | sed 's/^/  - حذف پشتیبان قدیمی: /'

echo "  ✓ $(find "$DEST" -name 'ethiclens-*.db.gz' | wc -l) پشتیبان نگهداری می‌شود (‌$KEEP_DAYS روز)"
