import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * The React app is one bundle served by the existing Express server.
 *
 * Output goes to public/app/ rather than a top-level dist/, because Express
 * already serves public/ as static and the deploy copies that directory as
 * it is. Keeping the build inside it means no new serving rule and no change
 * to how files reach the server.
 *
 * The dev server proxies /api to Express instead of hosting its own backend,
 * so sessions, CSRF and the SSE analysis stream behave in development exactly
 * as they do in production — the alternative is discovering cookie and
 * streaming problems only after deploying.
 */
export default defineConfig({
  root: 'client',

  // The app is served from /app/, not the domain root, so built asset URLs
  // have to carry that prefix. Without it the bundle requests /assets/… ,
  // Express answers with the SPA's own index.html, and the browser refuses
  // it as a stylesheet — a blank page whose only clue is a MIME-type error.
  base: '/app/',

  plugins: [react(), tailwindcss()],

  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'client/src') }
  },

  build: {
    outDir: path.resolve(process.cwd(), 'public/app'),
    emptyOutDir: true,
    // Hashed filenames let the built assets be cached hard while HTML stays
    // fresh; Express already sends public/ with a one-hour max-age.
    assetsDir: 'assets',
    sourcemap: false
  },

  server: {
    port: 5173,
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
