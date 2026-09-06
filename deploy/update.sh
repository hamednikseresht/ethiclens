#!/usr/bin/env bash
#
# One command to update a deployed Ethic Lens.
#
#   sudo BRANCH=<branch> bash /opt/ethiclens/deploy/update.sh
#
# Exists because running the four update steps by hand kept going wrong in two
# specific ways, both of which look like success:
#
#   1. A remote URL carrying a username (https://user@github.com/...) forces
#      git to authenticate. GitHub stopped accepting account passwords for git
#      in August 2021, so it returns HTTP 401 every time, forever. This script
#      normalises the URL before pulling, so the mistake heals itself instead
#      of being re-typed.
#
#   2. Steps typed on separate lines run independently: a failed pull does not
#      stop npm from reinstalling or the service from restarting, so the
#      output fills with success messages while the code is unchanged. Here
#      the whole thing aborts on the first failure.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ethiclens}"
APP_USER="${APP_USER:-ethiclens}"
SERVICE="${SERVICE:-ethiclens}"

# Defaults to the branch that is already checked out rather than to a fixed
# name. Hard-coding "main" meant every deploy of a different branch had to
# pass BRANCH= or hit a pull that cannot fast-forward, which fails safely but
# reads like a broken script.
BRANCH="${BRANCH:-$(git -C "${APP_DIR:-/opt/ethiclens}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"

say()  { printf '\n\033[1m> %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n  \033[31mFAILED: %s\033[0m\n\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run this script with sudo."
[ -d "$APP_DIR/.git" ] || die "$APP_DIR is not a git repository."

cd "$APP_DIR"

# ---------------------------------------------------------------------------
say "Checking the remote URL"

REMOTE="$(sudo -u "$APP_USER" git remote get-url origin)"

# Strip a bare username: https://user@host/... only.
#
# Deliberately does NOT touch https://user:token@host/... — that form can be
# working authentication for a private repository, and removing it would
# break a setup that was fine. A bare username cannot authenticate with
# GitHub at all any more, so removing that one is always safe.
CLEAN="$(printf '%s' "$REMOTE" | sed -E 's#^(https://)[^/@:]+@#\1#')"

if [ "$CLEAN" != "$REMOTE" ]; then
  warn "the URL carried a username - that is what caused the 401."
  sudo -u "$APP_USER" git remote set-url origin "$CLEAN"
  ok "corrected: $CLEAN"
else
  ok "$REMOTE"
fi

# A private repo cannot be pulled without credentials at all, so say which
# case we are in rather than letting git open a prompt this script cannot
# answer (it runs unattended under sudo).
if ! curl -fsS -o /dev/null --max-time 15 \
     "$(printf '%s' "$CLEAN" | sed -E 's#^https://github\.com/#https://api.github.com/repos/#; s#\.git$##')" 2>/dev/null; then
  warn "the repository is not public, or GitHub was unreachable."
  warn "if it is private, use a personal access token or an SSH key, not a password."
fi

# ---------------------------------------------------------------------------
say "Pulling branch $BRANCH"

BEFORE="$(sudo -u "$APP_USER" git rev-parse --short HEAD)"

# GIT_TERMINAL_PROMPT=0 turns a credential prompt into an immediate failure.
# Without it an unattended run hangs forever waiting for a username nobody
# will type.
pull() { sudo -u "$APP_USER" env GIT_TERMINAL_PROMPT=0 git pull --ff-only origin "$BRANCH"; }

if ! pull; then
  # Some networks break git's HTTP/2 POST. The ref advertisement (a GET on a
  # fresh connection) succeeds, then the upload-pack POST goes out on the same
  # multiplexed connection, arrives damaged, and GitHub answers 401. Git reads
  # that as "needs a password" and asks for one — so the symptom points at
  # credentials while the cause is the transport.
  #
  # Retried on HTTP/1.1, and the setting is persisted system-wide when that is
  # what fixed it, so the next run and every other repository on the machine
  # work too.
  if [ -z "$(git config --system --get http.version || true)" ]; then
    warn "pull failed - retrying over HTTP/1.1..."
    if sudo -u "$APP_USER" env GIT_TERMINAL_PROMPT=0 \
         git -c http.version=HTTP/1.1 pull --ff-only origin "$BRANCH"; then
      git config --system http.version HTTP/1.1
      ok "HTTP/1.1 fixed it - set permanently"
    else
      die "pull failed. A 401 on a public repository means the server's network; on a private one it means the token is missing."
    fi
  else
    die "pull failed - read the git output above."
  fi
fi

AFTER="$(sudo -u "$APP_USER" git rev-parse --short HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  ok "already up to date ($AFTER)"
else
  ok "$BEFORE -> $AFTER"
  sudo -u "$APP_USER" git --no-pager log --oneline "$BEFORE..$AFTER" | sed 's/^/    /'
fi

# ---------------------------------------------------------------------------
say "Installing dependencies"

[ -f package-lock.json ] || die "package-lock.json is missing - the files were copied incompletely."

# The full install, not --omit=dev: the frontend is a Vite bundle that has to
# be compiled here, and its toolchain lives in devDependencies.
#
# Building on the server rather than committing the bundle is a deliberate
# trade. A committed bundle can silently fall out of step with the source —
# someone pushes code without rebuilding and the site keeps serving the old
# app with no error anywhere. A build that fails here stops this script and
# says so.
sudo -u "$APP_USER" npm ci --no-audit --no-fund
ok "installed"

say "Building the frontend"

# vite builds into client-dist.next and the swap only happens on success, so a
# failed build leaves the running app untouched instead of deleting it.
if sudo -u "$APP_USER" npm run build; then
  ok "built"
else
  die "the frontend build failed - the previous bundle is untouched and still being served."
fi

# ---------------------------------------------------------------------------
say "Restarting the service"

systemctl restart "$SERVICE"

# A restart that "succeeds" and then crashes on a bad migration is the failure
# worth catching, so wait a moment and check it is genuinely still running.
sleep 3
if systemctl is-active --quiet "$SERVICE"; then
  ok "$SERVICE is running"
else
  printf '\n'
  journalctl -u "$SERVICE" -n 25 --no-pager | sed 's/^/    /'
  die "the service did not come up - see the log above."
fi

PORT="$(grep -oP '^\s*PORT\s*=\s*\K[0-9]+' "$APP_DIR/.env" 2>/dev/null || echo 3000)"
if curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/api/health" > /dev/null; then
  ok "health check passed"
else
  warn "the service is running but did not answer /api/health - check the log."
fi

printf '\n\033[32m  Update complete.\033[0m\n\n'
