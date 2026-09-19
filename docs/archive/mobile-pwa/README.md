# Archived: mobile PWA mockups

Historical HTML prototypes. **Not production code.** The four-tab bar, two-step
form and warm stone tokens already live in the React app
(`client/src/components/AppShell.jsx`, `client/src/pages/Analyze.jsx`,
`client/src/index.css`).

**Do not copy `service-worker.js` into `public/sw.js`.** That prototype
intercepts `/api/` and caches individual analysis GETs. The live worker must
never touch `/api` (SSE streams) and must never cache HTML.

The original handoff still describes a vanilla HTML app because that is what
the product was when these files were drawn. Ignore that instruction.
