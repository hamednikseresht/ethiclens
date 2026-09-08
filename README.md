# Ethic Lens — دیدگاه اخلاق

A web application that analyses a real ethical dilemma through **eight schools
of moral philosophy** and puts the result through a **five-stage refinement
flowchart**, arriving at one defensible course of action.

The product is Persian and right-to-left throughout. This document, the code
and the comments are English; Persian belongs to what a visitor reads.

The theory is documented at `/guide`: the eight lenses, the five gates and the
five-phase process, each cited to a primary source. (`ethic_2.html` is the
project's original sketch and no longer backs that page.)

---

## What it does

**For a user**
- Describe a dilemma, optionally with context: stakeholders, options already
  considered, urgency, personal values
- A **streamed** analysis — the result fills in as the model writes it
- Eight lenses: virtue ethics, deontology, utilitarianism, the common good,
  contractualism, the ethics of care, existentialism, Nietzschean genealogy
- A **flowchart-ordered** verdict: dignity (veto) → justice (veto) → utility
  and common good → care and virtue → authenticity, each stage with its
  question, its finding and the lenses that argue for it
- A comparison matrix scoring every option against all eight lenses
- Tensions between the schools, a step-by-step recommendation, three decision
  tests, self-examination questions and blind spots
- Export as a standalone **HTML** file, as **PDF** through the browser's print
  dialog, or as Markdown
- History with search, starring and renaming; a stats dashboard; dark mode
- Installable as a **PWA** from any page on the site

**For an admin**
- **Several providers at once**: NVIDIA, OpenAI, OpenRouter, Groq, Together,
  DeepSeek or any OpenAI-compatible service, each with its own base URL and key
- Test a provider's connection, browse the account's model list, add in bulk
- Test every model at once to find the ones that have stopped working
- Choose which models users can reach, and the default
- A versioned editor for the **analysis prompt**, with activation and a reset
  to the factory text
- Tune `temperature`, `top_p`, `max_tokens`
- Users: roles, blocking, daily quota, password reset, approval queue
- Categories for published analyses, with a description and an icon
- Delete or unpublish any analysis
- Usage by model and by user, plus an audit log

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Server | Node.js + Express | no build step of its own |
| Database | SQLite (`better-sqlite3`, WAL) | one file; simple to deploy and back up |
| Session | `express-session` + SQLite store | HttpOnly cookie, survives a restart |
| Passwords | `bcryptjs` | no native dependency |
| App UI | React 19 + Vite + Tailwind v4 + Radix | mounted at `/app` |
| Public pages | server-rendered HTML | crawlable in the first response |
| Model | any OpenAI-compatible API | streamed over SSE |

The site is deliberately two halves. Everything behind a sign-in is the React
bundle under `/app`. Everything a search engine should read — the landing page,
the encyclopedia, the published analyses — is rendered on the server, because a
crawler handed an empty div indexes an empty div.

---

## Running locally

```bash
npm install
cp .env.example .env      # fill in SESSION_SECRET and a provider key
npm start
```

Then <http://localhost:3000>. The first admin account is created from
`ADMIN_EMAIL` / `ADMIN_PASSWORD`.

The frontend is built into `client-dist/`:

```bash
npm run build
```

Vite builds into `client-dist.next` and the swap only happens on success, so a
failed build leaves the running bundle untouched.

### Tests

```bash
npm test
```

Runs six suites in order — 248 checks:

| Suite | What it covers |
|---|---|
| `npm run check` | parses every inline script and client module; needs no server |
| `npm run smoke` | API routes against a running server |
| `npm run signup` | registration, approval, quota |
| `npm run guide` | encyclopedia content and admin editing |
| `npm run test:otp` | email codes and verification links |
| `npm run test:cats` | categories, publishing, public pages |

`check` exists to catch the page that serves 200 while its script has a syntax
error, so no button on it works — which the smoke test cannot see.

`node scripts/try-analysis.mjs` runs one real analysis end to end and reports
how closely the model followed the requested block format. It costs a live API
call, so it is not part of `npm test`.

---

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | server port |
| `NODE_ENV` | — | `production` enables real cache headers |
| `SESSION_SECRET` | — | **required in production.** `openssl rand -hex 32` |
| `DB_PATH` | `./data/ethiclens.db` | database file |
| `TRUST_PROXY` | `0` | set to `1` behind nginx |
| `SECURE_COOKIE` | `0` | set to `1` behind HTTPS |
| `NVIDIA_API_KEY` / `NVIDIA_BASE_URL` | — | `nvapi-…` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | — | `sk-…` |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` | — | `sk-…` |
| `BREVO_API_KEY` | — | transactional email |
| `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` / `MAILGUN_BASE_URL` | — | transactional email |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | the first admin account |

> These are for **first boot only**. After that, providers and keys are managed
> from the admin panel and stored in the database. A provider with no key is
> created but stays switched off.

---

## Layout

```
server/
  index.js              express, helmet/CSP with a per-request nonce, routing
  db.js                 SQLite schema, additive migrations, audit()
  seed.js               models, factory prompt, first admin
  session-store.js      session store on SQLite
  middleware/auth.js    loadUser / requireAuth / requireAdmin / CSRF
  routes/               auth, analyze (SSE), history, admin, public
  services/
    llm.js              generic client for any OpenAI-compatible API
    providers.js        providers, model resolution
    default-prompt.js   factory prompt + the user-message template
    schools.js          the eight lenses, five stages, matrix columns
    parser.js           @@key@@ block parsing
    completeness.js     which blocks came back missing or too thin
    render-analysis.js  server-side rendering of an analysis
    export-html.js      the standalone HTML/print document
    categories.js       category shelves and tags
    seo.js              meta tags, JSON-LD, slugs, nonce injection
client/
  index.html            the app shell
  src/                  React app: pages, components, lib
public/
  index.html            landing page
  pages/                guide, about, 404
  css/ js/              design system and the shared core for those pages
  icons/ fonts/         product mark, PWA icons, Shabnam
  sw.js manifest.webmanifest
deploy/                 systemd units, nginx, backup, update script, guide
scripts/                test suites and operational tools
```

---

## The model's output format

The model answers in marked blocks. Each starts with a line that is only
`@@key@@` and nothing else:

```
@@issue@@ @@reframe@@ @@facts@@ @@stakeholders@@ @@options@@ @@matrix@@
@@school:virtue@@ … @@school:nietzsche@@     (eight lenses, each led by «حکم: …»)
@@gate:dignity@@ … @@gate:authenticity@@     (five gates, each led by «وضعیت: …»)
@@tensions@@ @@recommendation@@ @@test@@
@@implementation@@ @@questions@@ @@blindspots@@ @@revisit@@
```

Twenty-six blocks. The client parses them as they stream and the server stores
them parsed. **If you edit the prompt in the admin panel, leave these keys
exactly as they are.**

The matrix asks for one column per lens. Adding or removing a lens means
changing `MATRIX_COLUMNS` in `server/services/schools.js`, the matching list in
`client/src/lib/analysis.js`, and the table header in the prompt. A stored
analysis keeps whatever width it was written with; a column no row scored is
simply not drawn.

---

## Email verification

Verification email goes out over the **Brevo or Mailgun HTTP API**, not SMTP —
it is one `fetch` and adds no dependency.

**The default gate is soft:** an unverified user can sign in and look around,
but `POST /api/analyze/stream` is closed to them. The real risk from a fake
signup is burning API credit, not the sign-in itself, and locking sign-in
entirely would shut out anyone who mistyped their address. The admin panel can
raise it to the whole site.

| Behaviour | Detail |
|---|---|
| Token | 32 random bytes; only the SHA-256 digest is stored |
| Validity | 24 hours, single use; a new token invalidates the previous ones |
| Resend | at least 60 seconds apart, so nobody's inbox is flooded |
| On success | signs the user in, so the path has no friction |
| With no mail provider | new accounts count as verified, so nobody is stranded |
| Send failure | registration still succeeds; the error goes to the audit log |
| Existing users | marked verified by the migration |
| API key | server-side only; never returned to the admin panel |

> If your Mailgun account is **European**, set the region to
> `api.eu.mailgun.net` in the admin panel or every call returns 401. A Mailgun
> sandbox account only delivers to verified recipients.

---

## URL map

The application lives under `/app`; the indexable pages have their own
addresses at the root.

| Address | What it is |
|---|---|
| `/` | landing page |
| `/guide` | the encyclopedia |
| `/explore` | published analyses, with category shelves |
| `/category/<slug>` | one category |
| `/analysis/<category>/<slug>` | one published analysis |
| `/about` | about the project |
| `/app` | the application — behind sign-in, `noindex` |
| `/app/history`, `/app/dashboard`, `/app/settings`, `/app/admin` | app screens |

Every address the product has ever used redirects rather than 404s: `/intro`,
`/g`, `/p`, `/a/<slug>`, `/c/<slug>`, and the bare `/login`, `/history`,
`/dashboard`, `/settings`, `/admin`, `/verify`.

---

## Publishing and SEO

Any analysis can have its own indexable address,
`/analysis/<category>/<persian-title>`, listed on `/explore`.

**Publishing is always an explicit choice by the analysis owner, never
automatic.** Dilemma text is personal and may carry names or identifying
detail, so the user is warned first and can write a separate public title and
summary and stay anonymous. Unpublishing 404s the page immediately but keeps
the slug, so republishing does not break the link.

| Provided | Detail |
|---|---|
| Server rendering | the content is in the first response, not added by script |
| `<title>` and meta description | from the public title and summary, sized for Google |
| Canonical | absolute, from the "site URL" setting |
| OpenGraph and Twitter Card | for social previews |
| Structured data | `Article` and `BreadcrumbList` per analysis, `ItemList` on `/explore` |
| `sitemap.xml` | static pages plus every published analysis |
| `robots.txt` | public paths open; `/app`, `/api/` and the like closed |
| `noindex` | on every in-app screen |
| Internal links | guest navigation, breadcrumbs and a shared footer |

> Before publishing, set **site URL** in admin → site settings (for example
> `https://ethiclens.ir`). Without it, canonical links and the sitemap have no
> absolute address.

---

## Security notes

- bcrypt passwords; session in an `HttpOnly` + `SameSite=Lax` cookie
- CSRF double-submit on every mutating route
- A strict CSP with a per-request nonce — no `unsafe-inline` for scripts
- API keys stay server-side and are masked in admin responses
- The settings response is allow-listed so no sensitive value leaks
- Rate limits on sign-in and registration; a daily analysis quota per user
- Sensitive events written to `audit_log`
- Users reach only their own analyses (`user_id` checked in every query)

---

## Model compatibility

Newer OpenAI families (GPT-5 and the o-series) want `max_completion_tokens`
instead of `max_tokens` and reject custom `temperature`/`top_p`. The client has
two layers of defence: an initial guess from the model name, and automatic
adaptation after a 400. Future models therefore work without a code change.

---

## Deployment

Full Ubuntu guide: [`deploy/DEPLOY.md`](deploy/DEPLOY.md)

```bash
sudo bash /opt/ethiclens/deploy/update.sh
```

The Android app for Google Play is a Trusted Web Activity around this same
PWA — no second codebase, and a website deploy updates it without review:
[`deploy/TWA.md`](deploy/TWA.md).

---

## Disclaimer

Analyses are produced by a language model and can be wrong or incomplete.
Ethic Lens is not a substitute for legal, medical or psychological advice, and
the final decision and its consequences rest with the user.

## Licence

MIT
