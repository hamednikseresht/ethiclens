# syntax=docker/dockerfile:1
#
# Ethic Lens — production image.
#
# Two stages, both on the same Debian base. That is not a style choice:
# better-sqlite3 ships no prebuilt binaries, so it is compiled here, and a
# .node file built against glibc will not load on a musl runtime. Building on
# bookworm and running on bookworm keeps the two in step.
#
# The frontend is built in the image rather than committed to the repository.
# A committed bundle drifts silently — someone pushes source without
# rebuilding and the site serves the old app with no error anywhere — whereas
# a build that fails here fails the image.

# ---------------------------------------------------------------------------
# Stage 1: install, compile the native module, build the frontend
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

# node-gyp needs all three. Ubuntu carries python3 already; a slim image does
# not, and without it npm ci dies with "gyp ERR! find Python".
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copied on their own so this layer is reused whenever only source changed.
COPY package.json package-lock.json ./

# The full install, not --omit=dev: Vite and its plugins live in
# devDependencies and the bundle has to be built here.
RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build

# Drops the build toolchain's packages but keeps the compiled better-sqlite3
# binary, so the runtime stage copies a tree that is production-only and
# already built. Reinstalling in the runtime stage instead would mean
# compiling the native module a second time.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# sqlite3 is here for deploy/backup.sh, which uses .backup rather than cp —
# the database runs in WAL mode and a plain file copy can catch it mid-write.
RUN apt-get update && apt-get install -y --no-install-recommends \
      sqlite3 \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/ethiclens.db

WORKDIR /app

# The node image already has an unprivileged `node` user (uid 1000). The
# application never writes inside /app — only to DB_PATH — so the code is
# owned by root and readable, and only the data volume is writable.
COPY --from=builder --chown=root:root /app/node_modules ./node_modules
COPY --from=builder --chown=root:root /app/client-dist ./client-dist
COPY --chown=root:root package.json ./
COPY --chown=root:root server ./server
COPY --chown=root:root public ./public
COPY --chown=root:root scripts ./scripts
COPY --chown=root:root deploy ./deploy

# Created here so the container still starts when no volume is mounted — a
# `docker run` with no -v gets a working (if ephemeral) database rather than a
# crash on an unwritable path.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

# Uses node itself rather than curl, which keeps curl out of the image. The
# start period covers first boot, where the schema is created and seeded.
#
# Sets exitCode and lets the loop drain rather than calling process.exit()
# inside the promise — forcing an exit from a resolved callback trips a libuv
# assertion on some platforms, and a health check that crashes reports
# unhealthy for the wrong reason.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const u='http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health';fetch(u).then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>{process.exitCode=1})"

# Not `npm start`: npm sits between the init process and node, and forwards
# neither SIGTERM cleanly, so a stop waits for the timeout and then kills.
# Exec'ing node directly makes it PID 1 and lets its own shutdown handler run.
CMD ["node", "server/index.js"]
