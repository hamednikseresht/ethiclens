#!/usr/bin/env bash
#
# Update a Docker deployment of Ethic Lens.
#
#   sudo BRANCH=<branch> bash /opt/ethiclens/deploy/docker-update.sh
#
# The Docker counterpart of update.sh, and it exists for the same reason:
# typed one line at a time, a failed pull does not stop the rebuild, so the
# output fills with success while the code is unchanged. Everything here
# aborts on the first failure.
#
# The rebuild is what installs — there is no separate install step. A new
# image is built, and only if that succeeds is the running container replaced.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ethiclens}"
BRANCH="${BRANCH:-$(git -C "${APP_DIR:-/opt/ethiclens}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"

say()  { printf '\n\033[1m> %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n  \033[31mFAILED: %s\033[0m\n\n' "$*" >&2; exit 1; }

[ -d "$APP_DIR/.git" ] || die "$APP_DIR is not a git repository."
cd "$APP_DIR"

command -v docker >/dev/null || die "docker is not installed."
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is missing."
[ -f .env ] || die ".env is missing. Copy .env.example and fill in SESSION_SECRET."

# ---------------------------------------------------------------------------
say "Backing up the database"

# Before the pull, not after: if a migration in the new code goes wrong, the
# copy has to predate it. Skipped when no volume exists yet, which is the
# first run.
if docker compose ps -q app >/dev/null 2>&1 && [ -n "$(docker compose ps -q app 2>/dev/null)" ]; then
  bash "$APP_DIR/deploy/docker-backup.sh" || warn "backup failed - continuing, but read the error above."
else
  ok "nothing running yet, nothing to back up"
fi

# ---------------------------------------------------------------------------
say "Pulling branch $BRANCH"

BEFORE="$(git rev-parse --short HEAD)"
if ! git pull --ff-only origin "$BRANCH"; then
  # Same HTTP/2 failure the bare-metal script handles: the ref advertisement
  # succeeds, the upload-pack POST arrives damaged, GitHub answers 401 and git
  # reads that as a missing password.
  if [ -z "$(git config --system --get http.version || true)" ]; then
    warn "pull failed - retrying over HTTP/1.1..."
    git -c http.version=HTTP/1.1 pull --ff-only origin "$BRANCH" \
      && git config --system http.version HTTP/1.1 \
      && ok "HTTP/1.1 fixed it - set permanently" \
      || die "pull failed. A 401 on a public repository means the server's network."
  else
    die "pull failed - read the git output above."
  fi
fi

AFTER="$(git rev-parse --short HEAD)"
if [ "$BEFORE" = "$AFTER" ]; then
  ok "already up to date ($AFTER)"
else
  ok "$BEFORE -> $AFTER"
  git --no-pager log --oneline "$BEFORE..$AFTER" | sed 's/^/    /'
fi

# ---------------------------------------------------------------------------
say "Building the image"

# Built before anything is stopped. A failure here leaves the old container
# running and serving, which is the whole point of doing it in this order.
docker compose build app || die "the image build failed - the running container is untouched."
ok "built"

say "Starting the new container"

docker compose up -d app
ok "started"

# ---------------------------------------------------------------------------
say "Waiting for it to become healthy"

# A container that starts and then dies on a bad migration is the failure
# worth catching, so this waits for the health check rather than trusting that
# "up" means working.
for i in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)"
  case "$state" in
    healthy)   ok "healthy"; break ;;
    unhealthy) docker compose logs --tail 30 app; die "the container reports unhealthy - see the log above." ;;
  esac
  [ "$i" -eq 30 ] && { docker compose logs --tail 30 app; die "still not healthy after 60s - see the log above."; }
  sleep 2
done

# Images from previous builds pile up otherwise; a small server fills its disk
# with them within months. Only dangling ones, so a tagged rollback target
# survives.
say "Removing dangling images"
docker image prune -f >/dev/null && ok "done"

printf '\n\033[32m  Update complete.\033[0m\n\n'
