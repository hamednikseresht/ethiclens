import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * The React app is one bundle served by the existing Express server.
 *
 * Output goes to client-dist/, which Express mounts explicitly: the hashed
 * assets at /assets and the shell as the fallback for every app route.
 *
 * The dev server proxies /api to Express instead of hosting its own backend,
 * so sessions, CSRF and the SSE analysis stream behave in development exactly
 * as they do in production — the alternative is discovering cookie and
 * streaming problems only after deploying.
 */
export default defineConfig({
  root: 'client',

  // The application is served from /app, so its asset URLs carry that
  // prefix. The root belongs to the homepage and the pages a visitor reads
  // before signing in.
  base: '/app/',

  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'client/src'),
      // Shared with the pages still being served the old way, so the quote
      // deck has one home rather than two copies that drift.
      '@shared': path.resolve(process.cwd(), 'public/js')
    }
  },

  build: {
    // Built into a staging directory, never straight over the live one.
    // Vite empties outDir before it starts, so building directly into the
    // served path means a build that fails halfway has already deleted the
    // assets the site was running on — a white page with no way back until
    // the next successful build. deploy/update.sh swaps this in only after
    // the build reports success.
    // Outside public/ on purpose. Anything under public/ is also reachable at
    // its own URL, which would give every built file a second address — and
    // the shell a second one that no route controls.
    outDir: path.resolve(process.cwd(), 'client-dist.next'),
    emptyOutDir: true,
    // Hashed filenames let the built assets be cached hard while HTML stays
    // fresh: Express serves everything under this directory immutable for a
    // year and the shell that names them no-cache.
    assetsDir: 'assets',
    sourcemap: false
  },

  server: {
    port: 5173,
    // The alias above points outside the Vite root, which the dev server
    // blocks by default.
    fs: { allow: [process.cwd()] },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        // The analysis endpoint streams for minutes. Buffering it here would
        // hide every partial result until the very end and make the waiting
        // screen untestable in development.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (String(proxyRes.headers['content-type'] || '').includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform';
            }
          });
        }
      }
    }
  }
});
