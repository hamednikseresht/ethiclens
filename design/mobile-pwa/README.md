# Mobile PWA redesign — design source

Reference material for the mobile-first redesign. **None of this is production
code.** The product is vanilla HTML + CSS + ES modules with no build step, and
the redesign is implemented in that existing structure — these files say what
to build, not what to ship.

| File | What it is |
|---|---|
| `HANDOFF.md` | The specification. Tokens, type scale, all eight screens, components, interactions, PWA notes. Read this first. |
| `tokens.css` | The token block from the handoff, ready to merge into `public/css/app.css`. |
| `motion.css` | Keyframes the redesign adds (breathe, orbit, shimmer) with reduced-motion guards. |
| `manifest.webmanifest` | PWA manifest to adapt. Icons are **not** included — they have to be exported from the brand mark. |
| `service-worker.js` | Caching strategy to adapt. Read it before shipping: a service worker that intercepts `/api/` will break the SSE analysis stream. |
| `pwa-snippet.html` | The `<head>` additions: manifest link, theme colour, viewport-fit, apple-touch icons. |
| `prototype-mobile-pwa.dc.html` | The redesign itself, screens 1a–1h. Open in a browser. |
| `prototype-current.dc.html` | Today's app recreated at 390px, for side-by-side comparison. |
| `support.js` | Runtime the two prototypes need. Not used by the product. |

## Two things the handoff is explicit about

**Bottom tab bar replaces the topbar.** Four tabs — تحلیل تازه, تاریخچه,
عمومی, دانشنامه — with account, settings and admin moving into a profile
sheet. This is also the fix for the known overflow bug, where 591px of nav
links were squeezed into a 24px window at 375px wide and several routes were
unreachable.

**The eight school colours and five gate names come from
`server/services/schools.js`.** The handoff repeats them for reference but
says not to fork them by hand — that file stays the single source of truth.

## Out of scope

Settings, admin panel, dashboard and about were not redesigned. They inherit
the tokens and the tab-bar shell; their layouts are a follow-up.
