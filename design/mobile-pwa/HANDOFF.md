# Handoff: دیدگاه اخلاق (Ethic Lens) — Mobile PWA Redesign

## Overview

Redesign of the Ethic Lens web app (Persian, RTL) into a mobile-first installable PWA.
Scope covers the seven screens that carry the product: landing, new-analysis (2 steps),
waiting state, analysis result, history, guide (دانشنامه), and public analyses (عمومی).

Two structural changes drive everything else:

1. **Navigation** moves from a topbar + hamburger drawer to a **4-tab bottom bar**
   (تحلیل تازه · تاریخچه · عمومی · دانشنامه). Account/settings/admin move into a
   profile sheet opened from the avatar in the home header.
2. **The new-analysis form** splits into **two steps** — the dilemma textarea alone on
   step 1, the six optional context fields on step 2 — replacing today's single long
   form with an «اطلاعات تکمیلی» expander.

Everything else is a visual system change: warm stone neutrals instead of cold slate,
hairline borders instead of shadows, Lucide stroke icons instead of emoji, and a
Persian display face (Markazi Text) for headings alongside Vazirmatn for UI/body.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing
intended look and behavior, **not production code to copy directly**.

Your codebase is vanilla HTML + CSS + ES modules with no framework and no build step
(`public/pages/*.html`, `public/css/*.css`, `public/js/*.js`). Recreate these designs
**in that existing environment** — extend `public/css/app.css` with the token changes
below, keep the existing page/script structure, keep `core.js` as the shared client core.
Do not introduce a framework or a bundler for this work.

The two `.dc.html` files open directly in a browser. They are static screen mockups —
no live data, no API calls. Read them for exact values; do not lift their markup.

- `Ethic Lens Mobile PWA.dc.html` — the redesign, 8 screens, ids 1a–1h
- `Ethic Lens — Current Screens.dc.html` — faithful recreation of today's app at 390px,
  for before/after comparison

## Fidelity

**High-fidelity.** Colors, type, spacing, and radii below are final and exact. Recreate
pixel-faithfully. Where a value is not specified here, take it from the prototype file.

Prototype viewport is **390 × 844** (iPhone 14/15 logical size). Design fluid: nothing
should be pinned to 390px. Content column padding is `20px` on every screen.

---

## Design tokens

Add these to `public/css/app.css`. They **replace** the current slate-based neutral ramp;
the blue/teal brand pair and the eight school hues are unchanged from today.

```css
:root {
  /* Neutrals — warm stone (was cold slate) */
  --bg:            #f5f5f4;   /* app background            (was #f6f8fb) */
  --bg-raised:     #ffffff;   /* cards, sheets, tab bar    (was #ffffff) */
  --bg-sunken:     #fafaf9;   /* nested panels inside cards */
  --bg-muted:      #e7e5e4;   /* chips, track fills        (was #f1f5f9) */
  --border:        #e7e5e4;   /* hairline, 1px             (was #e2e8f0) */
  --border-strong: #d6d3d1;   /* device edge, dividers on white */
  --text:          #1c1917;   /* primary                   (was #0f172a) */
  --text-2:        #44403c;   /* body copy inside cards */
  --text-3:        #57534e;   /* secondary                 (was #64748b) */
  --text-4:        #78716c;   /* tertiary / captions */
  --text-5:        #a8a29e;   /* placeholder, metadata     (was #94a3b8) */

  /* Brand — unchanged */
  --primary:       #1d4ed8;   /* actions, active tab (blue-700; was #2563eb) */
  --primary-soft:  #eff6ff;
  --accent:        #0d9488;   /* teal, unchanged */
  --accent-soft:   #f0fdfa;
  --ink:           #1c1917;   /* dark surfaces: verdict card, primary button */
  --ink-2:         #292524;   /* dividers on dark */

  /* Verdicts */
  --danger:        #dc2626;  --danger-soft:  #fef2f2;
  --warn:          #d97706;  --warn-soft:    #fffbeb;
  --ok:            #059669;  --ok-soft:      #ecfdf5;

  /* Eight schools — identical to server/services/schools.js, do not change */
  --school-virtue:        #7c3aed;  /* فضیلت‌گرایی */
  --school-deontology:    #2563eb;  /* وظیفه‌گرایی */
  --school-utilitarian:   #0d9488;  /* فایده‌گرایی */
  --school-common-good:   #0891b2;  /* خیر مشترک */
  --school-contractual:   #ea580c;  /* قراردادگرایی */
  --school-care:          #db2777;  /* اخلاق مراقبت */
  --school-existential:   #65a30d;  /* اگزیستانسیالیسم */
  --school-genealogy:     #b45309;  /* تبارشناسی نیچه */

  /* Radius */
  --r-sm: 9px;  --r-md: 12px;  --r-lg: 14px;  --r-xl: 16px;  --r-2xl: 18px;
  --r-pill: 999px;

  /* Spacing — 20px gutter, 8/9/10/11/14 internal */
  --gutter: 20px;

  /* Type */
  --font-ui:      'Vazirmatn', system-ui, Tahoma, sans-serif;
  --font-display: 'Markazi Text', Georgia, serif;

  /* Safe areas */
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

**Shadows.** Removed from cards entirely. Cards are `1px solid var(--border)` on
`var(--bg-raised)` over `var(--bg)`. Keep shadow only for genuinely floating layers
(bottom sheets, toasts): `0 -8px 24px rgba(28,25,23,.10)`.

### Typography scale

Load Markazi Text alongside the existing Vazirmatn:

```html
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&family=Markazi+Text:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Markazi Text is a Persian/Arabic display face with a small optical size — it needs to be
set **larger** than you expect. Never below 22px. Never use it for UI labels or body copy.

| Role | Family | Size / line-height | Weight |
|---|---|---|---|
| Page title (تاریخچه، دانشنامه) | Markazi Text | 30 / 1.2 | 600 |
| Landing H1 | Markazi Text | 42 / 1.28 | 600 |
| Screen question (home H1) | Markazi Text | 33 / 1.32 | 600 |
| Verdict sentence | Markazi Text | 25 / 1.5 | 500 |
| Quote (waiting screen) | Markazi Text | 33 / 1.5 | 500 |
| Explore card title | Markazi Text | 22 / 1.4 | 600 |
| Big number (stat) | Markazi Text | 26 / 1 | 600 |
| Card title | Vazirmatn | 14–14.5 / 1.6 | 700 |
| Body / analysis prose | Vazirmatn | 12.5–13 / 1.9–2.0 | 400 |
| Textarea input | Vazirmatn | 14.5 / 2.0 | 400 |
| Secondary / caption | Vazirmatn | 11–11.5 / 1.7 | 400–500 |
| Tab label | Vazirmatn | 10 | 700 (800 active) |
| Pill / badge | Vazirmatn | 9.5–11.5 | 700–800 |
| Section eyebrow | Vazirmatn | 10–10.5 | 800, color `--text-5` |

Persian numerals throughout (۰۱۲۳۴۵۶۷۸۹). Use `font-variant-numeric: tabular-nums` on
counters and durations. Latin strings (model names, emails) get `direction: ltr` on their
own element — never flip the whole line.

### Iconography

Replace **all emoji** with [Lucide](https://lucide.dev) SVGs: 24×24 viewBox,
`stroke="currentColor"`, `stroke-width="2"` (2.1 for active tab, 2.4–2.8 for small
check/x glyphs inside 30px circles), round caps and joins. Rendered at 13–21px.

Icons used, by name: `compass` (brand mark, تحلیل تازه tab), `clock` (تاریخچه),
`globe` (عمومی), `book-open` (دانشنامه), `user` (profile), `chevron-left` /
`chevron-right` (RTL: `chevron-left` points forward), `chevron-down` / `chevron-up`
(disclosure), `arrow-left` (RTL forward arrow in primary button), `search`, `star`,
`share-2`, `check`, `x`, `alert-circle`, `plus`, `bell`, `smartphone`,
`bar-chart-3`, `landmark`, `arrow-left-right`, `heart`.

**RTL note:** chevrons must mirror. In `dir="rtl"`, "forward/next" is `chevron-left`
and "back" is `chevron-right`. Use logical properties everywhere:
`border-inline-start`, `padding-inline-end`, `margin-inline-start`.

---

## Screens

### 1a — Home / New analysis, step 1
*Prototype id `1a`. Replaces `public/pages/app.html`.*

**Purpose:** the default landing surface for a signed-in user. Write the dilemma, nothing else.

**Layout:** column flex, full viewport height.
Status bar area (`--safe-top`) → header 34px logo row → step indicator → H1 + subhead →
textarea card → examples list → sticky footer button → tab bar.

**Header** (`padding: 4px 20px 14px`, flex, gap 11px):
- Brand mark: 34×34, `border-radius: 11px`, background `--ink`, white `compass` icon 19px.
- Title `دیدگاه اخلاق` — Markazi Text 22/1.1, weight 600.
- Subtitle — Vazirmatn 10.5, weight 500, `--text-5`. Live quota text:
  `۳ تحلیل از ۵ امروز باقی مانده`. Pull from the same tier endpoint that feeds today's
  «گروه پایه» line in `app.html`.
- Profile button pushed to the far edge: 36×36 circle, `1px solid var(--border)`,
  white fill, `user` icon 18px `--text-3`. Opens the account sheet
  (settings, tier, theme, admin link, logout).

**Step indicator** (margin-bottom 16px): pill `گام ۱ از ۲` — Vazirmatn 10/800,
`--text-3` on `--bg-muted`, padding `4px 10px`, radius pill — then a flex-1 track,
3px tall, radius 999px, `--bg-muted`, with a 50%-width `--primary` fill.

**H1:** `چه چیزی روی دلت سنگینی می‌کند؟` — Markazi Text 33/1.32, weight 600, margin-bottom 6px.
**Subhead:** `موقعیت را همان‌طور که هست بنویسید — بی‌پرده. هرچه دقیق‌تر، تحلیل کمتر کلی‌گویانه.`
Vazirmatn 13/1.95, `--text-4`, margin-bottom 16px.

**Textarea card:** white, `1px solid var(--border)`, radius 16px, padding `15px 16px 12px`.
The textarea itself is borderless and transparent (the card *is* the field), Vazirmatn
14.5/2.0, color `--text`, auto-growing, min-height ~7 lines. Placeholder is today's
existing example text, `--text-5`.
Footer row inside the card: `margin-top 12px; padding-top 11px; border-top: 1px solid #f5f5f4`,
space-between —
- left: validation state. Below 20 chars → `--text-5`, `حداقل ۲۰ نویسه`.
  At/above → `--ok`, Vazirmatn 11/700, with a 13px `check` icon, text `طول کافی است`.
- right: counter `۱۴۲ / ۸۰۰۰` — Vazirmatn 11/600, `--text-5`, tabular-nums.
  Turns `--warn` past 7200, `--danger` at 8000 (hard cap, same as today).

**Examples** (replaces the three `نمونه` chips): eyebrow `یا از یک نمونه شروع کنید`
(margin `22px 0 9px`), then a 8px-gap column of full-width buttons — white, hairline,
radius 12px, padding `11px 13px`, Vazirmatn 12.5/1.7 weight 600 `--text-2`, text right-aligned.
Each has a leading 6px dot in the school hue of the dilemma's dominant domain, and a
trailing 15px `chevron-left` in `--text-5`. Tapping fills the textarea and scrolls to it.

**Primary CTA:** in a sticky footer with a fade
(`background: linear-gradient(180deg, transparent, var(--bg) 40%)`, padding `12px 20px 10px`).
Full width, min-height 52px, radius 14px, background `--ink`, white, Vazirmatn 15/700,
centered with an `arrow-left` 17px. Label `ادامه — افزودن زمینه`.
Disabled below 20 chars: `opacity: .4; pointer-events: none`.

**Tab bar** — see *Components → Bottom tab bar*.

---

### 1b — New analysis, step 2 (context)
*Prototype id `1b`. This is the content of today's «اطلاعات تکمیلی» expander, promoted to its own screen.*

**Purpose:** optional enrichment. Every field skippable; `رد کردن` in the header jumps
straight to submit.

**Header:** back `chevron-right` 21px in a 38×38 hit target, title `زمینه دوراهی`
(Vazirmatn 14/800), `رد کردن` text button (Vazirmatn 12.5/700, `--text-4`) at the far edge.
Step pill reads `گام ۲ از ۲` in `--primary` on `--primary-soft`; track fill 100%.
No tab bar on this screen — it is a modal step in a flow.

**Intro note:** white card, hairline, radius 12px, padding `11px 13px`, Vazirmatn 12.5/1.95
`--text-4`: `هرکدام را پر کنید، تحلیل مشخص‌تر می‌شود. همه اختیاری‌اند.`

**حوزه (domain):** eyebrow, then wrapping 7px-gap chips, padding `8px 13px`, radius pill.
Unselected: white, hairline, Vazirmatn 12/600, `--text-3`. Selected: `--ink` fill, white
text, weight 700. Options are today's existing domain list (محیط کار و حرفه، خانواده، سلامت،
کسب‌وکار، فناوری و هوش مصنوعی، …).

**فوریت (urgency):** segmented control. Track `--bg-muted`, radius 12px, padding 3px;
four equal segments, each `padding: 10px 4px`, radius 9px, Vazirmatn 11.5/1.
Active segment: white fill, weight 700, `--text`, `box-shadow: 0 1px 2px rgba(0,0,0,.05)`.
Inactive: transparent, weight 600, `--text-4`. Options: امروز / چند روز / چند هفته / فوری نیست.

**Remaining fields as rows** (9px gap), each a full-width white button, hairline, radius 13px,
padding `13px 14px`, flex gap 11px:
- 30×30 icon tile, radius 9px, tinted background + matching icon color:
  `user` on `--accent-soft`/`--accent`, `arrow-left-right` on `#f5f3ff`/`#7c3aed`,
  `heart` on `#fdf2f8`/`--school-care`.
- Label Vazirmatn 13/700; value line Vazirmatn 11.5/400 `--text-5`, single-line ellipsis.
  Empty state value is `افزودن`.
- Trailing: filled state → 20px `--ok` circle with a white 12px `check`;
  empty state → 17px `chevron-left` `--text-5`.
Rows open bottom sheets containing the actual inputs. Fields: چه کسانی درگیرند،
گزینه‌هایی که به آن فکر کرده‌اید، ارزش‌ها و محدودیت‌های شخصی — plus whatever else
`app.html` collects today; keep the same field names in the request payload.

**Model row:** same card shape, label `مدل تحلیل`, value `llama-3.3-70b` (`direction: ltr`)
with a 14px `chevron-down`. Only shown when the user's tier can choose a model.

**Submit:** `--primary` fill (not `--ink` — this is the irreversible action), min-height 54px,
radius 14px, white, Vazirmatn 15/700, with an 18px `compass` icon.
Label `تحلیل اخلاقی را شروع کن`. Below it, centered Vazirmatn 11 `--text-5`:
`حدود ۴۰ ثانیه · می‌توانید اپ را ببندید`.

---

### 1c — Waiting state
*Prototype id `1c`. Replaces the inline `.wait` orb block in `app.html`.*

**Purpose:** hold ~40 seconds of dead time with something worth reading.

**This screen is dark** — `background: var(--ink)`, `color: #fafaf9` — deliberately, as a
held breath between input and verdict. It is the only dark surface in light mode. If you'd
rather keep the app uniformly light, invert: `--bg` background, `--text` foreground,
`--primary` quote mark, and drop the two radial glows to 40% opacity.

No tab bar, no back button — the analysis is running.

**Ambient glows:** two absolutely-positioned circles behind the content.
280px at `top:120px; inset-inline-start:-90px`, `radial-gradient(circle, rgba(29,78,216,.34), transparent 68%)`;
240px at `top:330px; inset-inline-end:-80px`, `radial-gradient(circle, rgba(13,148,136,.26), transparent 68%)`.
Both animate `el-breathe` (7s and 9s, `ease-in-out infinite`):
`0%,100% { transform: scale(1); opacity: .5 } 50% { transform: scale(1.07); opacity: .9 }`.
Wrap in `@media (prefers-reduced-motion: reduce)` and freeze at 50%.

**Status line** (top): 26px ring spinner — `1.5px solid rgba(250,250,249,.15)` with
`border-top-color: #fafaf9`, `animation: el-orbit 1.4s linear infinite` — then
Vazirmatn 12.5/700 `#d6d3d1`, text `در حال تحلیل — دروازه سوم از پنج`, driven by the
existing streaming progress events.

**Quote block** (vertically centered, the hero of the screen):
- 34px tile, radius 10px, `rgba(37,99,235,.18)` fill, `#93c5fd` `landmark` icon 19px.
- Quote: Markazi Text 33/1.5 weight 500, `#fafaf9`, `text-wrap: pretty`, margin-bottom 24px.
- Attribution: name Vazirmatn 13/800 `#93c5fd`; source Vazirmatn 11.5/400 `--text-4`, 3px below.
- Source data: the existing `public/js/quotes.js` pool. Rotate every 9s with a 400ms
  cross-fade (`opacity` + `translateY(8px)`); pause rotation under reduced-motion.

**Gate progress** (above the fold bottom): five equal 3px bars, 5px gap.
Completed `--ok`; in-flight is a partial gradient
(`linear-gradient(90deg, var(--primary) 60%, rgba(250,250,249,.14) 60%)`); pending
`rgba(250,250,249,.14)`. Below: percentage Vazirmatn 12/700 `--text-4` tabular-nums,
and a `لغو` text button at the far edge.

**Footer:** `border-top: 1px solid var(--ink-2)`, `bell` icon 17px `--text-4`, and
Vazirmatn 11.5/1.7 `--text-4`: `می‌توانید اپ را ببندید — وقتی تحلیل آماده شد خبرتان می‌کنیم.`
Back this with a notification only if you actually implement push; otherwise reword to
`تحلیل در تاریخچه ذخیره می‌شود.`

---

### 1d — Analysis result
*Prototype id `1d`. Replaces `public/pages/analysis.html` + `public/css/result.css`.*

**Purpose:** deliver the verdict first, then let the user drill into the reasoning.

The single biggest change: today the page opens with metadata, the reframe, and a chip row,
and the recommendation is far down the scroll. **Invert it.** Recommendation at the top,
gate ladder second, reasoning cards third, metadata demoted into the header and a details
disclosure at the bottom.

**Header:** `border-bottom: 1px solid var(--border)`, back `chevron-right`, then the
analysis title — Vazirmatn 12.5/1.5 weight 700, single line, ellipsis — then `star`
(bookmark) and `share-2` buttons, each 38×38, `--text-3`, filled `--warn` when bookmarked.
Move PDF export, publish/unpublish, rename, and delete into an overflow sheet behind
`share-2` (or a `more-horizontal` if you prefer a separate affordance).

**Verdict card** — the anchor of the screen.
Background `--ink`, color `#fafaf9`, radius 18px, padding `18px 18px 16px`, margin-bottom 14px.
- Eyebrow row: 16px `compass` icon `#93c5fd`, label `مسیر پیشنهادی` Vazirmatn 10.5/800
  `#93c5fd`, then at the far edge a confidence pill — Vazirmatn 10/700, `--text-5`,
  `--ink-2` fill, radius pill, padding `3px 8px`, text `اعتماد: متوسط` (کم / متوسط / بالا).
- Recommendation sentence: Markazi Text 25/1.5 weight 500, `text-wrap: pretty`, margin-bottom 13px.
- Steps: `padding-top: 13px; border-top: 1px solid var(--ink-2)`, 8px-gap column. Each step
  is a 17px numbered circle (`--ink-2` fill, `#d6d3d1`, Vazirmatn 9.5/800) plus
  Vazirmatn 12.5/1.85 `#d6d3d1` text. Cap at 3 steps here; overflow goes in the detail cards.

**Gate ladder:** white card, hairline, radius 16px, padding `14px 15px`.
Header row: `پنج دروازه` Vazirmatn 11/800 `--text-3`, and `۲ وتو · ۳ بهینه‌سازی`
Vazirmatn 10.5/600 `--text-5` at the far edge.
Then five equal columns joined by 14px × 1.5px `--border` connector rules
(`margin-bottom: 16px` so they align with the circle centers, not the labels).
Each gate: 30px circle, `1.5px solid` + `background` in its verdict pair
(نقض → `--danger`/`--danger-soft` with an `x` icon; مشروط → `--warn`/`--warn-soft` with
`alert-circle`; قبول → `--ok`/`--ok-soft` with `check`; اصالت/open → `--primary`/`--primary-soft`
with `plus`), and a 9.5px/700 label in the same hue.
Gate names, in order: کرامت، عدالت، فایده، مراقبت، اصالت — matching the stage list in
`server/services/schools.js`. Tapping a gate scrolls to its card.

**Gate cards** (9px gap column). Collapsed: white, hairline, radius 14px, padding `14px 15px`,
`border-inline-start: 3px solid` in the gate's verdict hue. Row contents: status pill
(Vazirmatn 10/800, hue text on hue-soft fill, e.g. `وتو · نقض شده`), title
`۱ · دروازه کرامت` Vazirmatn 14.5/700 flex-1, and a 17px chevron (`chevron-down` collapsed,
`chevron-up` expanded) in `--text-5`.
Expanded adds, in order:
1. `padding-top: 11px; border-top: 1px solid #f5f5f4`, then the stage conclusion —
   Vazirmatn 13/2.0 `--text-2`.
2. One nested lens panel per school that ruled on this gate: `--bg-sunken` fill, hairline,
   radius 11px, padding `11px 12px`, `border-top: 2px solid var(--school-*)`.
   Header: school name Vazirmatn 12/800, thinkers Vazirmatn 10.5/500 `--text-5`, and a
   verdict pill (مردود / مشروط / موجه) at the far edge. Body: Vazirmatn 12.5/1.9 `--text-3`.
3. For veto gates, keep today's explanatory footnote at Vazirmatn 12/1.75 `--text-4`.

First gate expanded by default; the rest collapsed. Persist expansion state per analysis id
in `localStorage` so returning to a result restores the reading position.

**Below the ladder** (not in the prototype, carry over from today's page, all collapsed):
تنش‌ها، پرسش‌های باز، نقاط کور، بازنگری (the review/journal entry), and a
`جزئیات فنی` disclosure holding date, model, duration, and token count — the chips that
today sit at the top.

---

### 1e — History
*Prototype id `1e`. Replaces `public/pages/history.html`.*

**Purpose:** find a past analysis fast, and see its shape without opening it.

Title `تاریخچه` Markazi Text 30/1.2 weight 600; subtitle Vazirmatn 11/500 `--text-5`:
`۱۴ تحلیل · ۳ منتظر بازنگری`.

**Search:** white card, hairline, radius 12px, padding `10px 13px`, 17px `search` icon
`--text-5`, then the input (borderless, Vazirmatn 13). Same title+text query as today.

**Filter chips:** horizontally scrollable row, 7px gap, no visible scrollbar.
همه / نشان‌شده / منتظر بازنگری / منتشرشده. Active: `--ink` fill, white, 700. Inactive:
white, hairline, `--text-3`, 600. These replace today's two checkboxes.

**Rows:** white card, hairline, radius 15px, padding `14px 15px`, 10px gap between cards.
- Title Vazirmatn 14/1.6 weight 700; excerpt Vazirmatn 11.5/1.7 `--text-5`, single line, ellipsis.
- Bookmarked rows show a filled `star` 17px `--warn` at the far edge of the title row.
- Meta row: `padding-top: 10px; border-top: 1px solid #f5f5f4`. Leading it is the
  **gate strip** — five 16×5px pills, 4px gap, radius 999px, each in that analysis's gate
  verdict hue. This is the row's fingerprint; it is what makes the list scannable. Then a
  status pill (بازنگری شد `--accent` on `--accent-soft` / منتظر بازنگری `--text-3` on
  `--bg-muted` / منتشرشده `--primary` on `--primary-soft`) and a relative timestamp
  Vazirmatn 10.5/500 `--text-5` at the far edge.
- Per-row rename/download/delete buttons are **gone**. Swipe the row to reveal them, or
  long-press for an action sheet — pick one and use it consistently.

Empty state: keep today's copy, set in the same card shape, `compass` icon instead of the emoji.

---

### 1f — Guide (دانشنامه)
*Prototype id `1f`.*

Title Markazi Text 30/1.2; intro Vazirmatn 12/1.85 `--text-4`:
`هشت مکتب، پنج دروازه و ۱۵ دوراهی واقعی. رنگ هر مکتب همان رنگی است که در تحلیل‌ها می‌بینید.`

Eight rows, 8px gap: white, hairline, radius 13px, padding `13px 14px`, and
`border-inline-start: 3px solid var(--school-*)` — this is the **only** place the eight
hues are introduced, and it is why they read as identity elsewhere. School name
Vazirmatn 14/700; thinkers Vazirmatn 11/400 `--text-5`; trailing 16px `chevron-left` `#d6d3d1`.

Order and colors exactly as `server/services/schools.js` declares them:
فضیلت‌گرایی #7c3aed · وظیفه‌گرایی #2563eb · فایده‌گرایی #0d9488 · خیر مشترک #0891b2 ·
قراردادگرایی #ea580c · اخلاق مراقبت #db2777 · اگزیستانسیالیسم #65a30d · تبارشناسی نیچه #b45309.

Below: a wider card linking to the flowchart and comparison matrix — 30px `--bg-muted` tile
with a `bar-chart-3` icon, label `فلوچارت تصمیم و ماتریس مقایسه` Vazirmatn 13.5/700.

---

### 1g — Public analyses (عمومی)
*Prototype id `1g`.*

Title Markazi Text 30/1.2; intro `دوراهی‌هایی که صاحبانشان به‌خواست خودشان منتشر کرده‌اند.`

Cards: white, hairline, radius 16px, padding `15px 16px`, 11px gap.
- Domain pill at the top — Vazirmatn 9.5/800, hue text on hue-soft fill, keyed to the
  domain's school hue (فناوری → `--school-common-good`, سلامت → `--school-care`,
  محیط زیست → `--school-existential`, …).
- Title Markazi Text 22/1.4 weight 600 — **this is the one list where the display face
  carries the row**, because these are read like articles, not scanned like records.
- Excerpt Vazirmatn 12/1.9 `--text-4`.
- Footer: `padding-top: 11px; border-top: 1px solid #f5f5f4`, 22px initial-avatar
  (`--bg-muted` fill, Vazirmatn 10/800 `--text-3`), author name Vazirmatn 11/600 `--text-4`,
  and the five-pill gate strip (14×4px here) at the far edge.

---

### 1h — Landing
*Prototype id `1h`. Replaces `public/index.html` on mobile widths.*

**Purpose:** convert a first-time visitor. Background is `#fafaf9` (a half-step lighter
than the app) so the marketing surface reads as a different place.

Compact brand row (30px mark, Markazi Text 19) with a `ورود` text link at the far edge.
H1 `تصمیم سختت را از هشت منظر ببین.` — Markazi Text 42/1.28 weight 600, `text-wrap: pretty`.
Subhead Vazirmatn 13.5/2.05 `--text-3`, naming the philosophers, ending on the promise of
`یک مسیر موجه با گام‌های عملی`.

Two stacked CTAs, 9px gap, min-height 52px, radius 14px:
`شروع رایگان` (`--ink` fill, white) and `اول دانشنامه را ببین` (white, hairline, `book-open` icon).
The guide is genuinely the best second click — it is the proof the product is serious.

Eight-lens chip cloud: white pills, hairline, radius pill, padding `7px 12px`,
Vazirmatn 11.5/700, each with a leading 6px dot in its school hue.

Two stat cards side by side (11px gap): white, hairline, radius 14px, padding 14px.
Number Markazi Text 26/1 weight 600; caption Vazirmatn 11/1.6 `--text-4`.
`۵` دروازه پالایش، دو تای اول وتوکننده · `۴۰″` میانگین زمان یک تحلیل کامل.

**Install bar** pinned to the bottom: white, `border-top: 1px solid var(--border)`,
34px `--bg-muted` tile with a `smartphone` icon, copy Vazirmatn 11.5/1.65 `--text-3`
(`افزودن به صفحه خانه — بی‌نیاز از مرورگر، با دسترسی آفلاین به تحلیل‌ها`), and a
`نصب` button (`--ink` fill, white, radius pill, padding `8px 13px`).
Show only when `beforeinstallprompt` has fired and the app is not already in standalone mode.

---

## Components

### Bottom tab bar

Present on 1a, 1e, 1f, 1g. Absent on 1b, 1c, 1d and any modal step.

```
background: rgba(255,255,255,.95);
backdrop-filter: saturate(180%) blur(14px);
border-top: 1px solid var(--border);
padding: 8px 8px calc(8px + var(--safe-bottom));
display: grid; grid-template-columns: repeat(4, 1fr);
```

Each tab is a column flex, 4px gap, centered, `text-decoration: none`.
Icon sits in a 44×26 box — the box is the hit target padding; combined with the label and
the 8px padding the total tap area clears 44px. Active tab: icon box gets
`background: var(--primary-soft); border-radius: 999px`, icon and label go `--primary`,
label weight 800, icon stroke 2.1. Inactive: transparent box, `--text-5`, label weight 700.

Order (RTL, right to left): تحلیل تازه · تاریخچه · عمومی · دانشنامه.

Do not add a badge to تاریخچه for pending reviews — the count already lives in the
history subtitle.

### Buttons

| Variant | Fill | Text | Height | Radius | Use |
|---|---|---|---|---|---|
| Primary dark | `--ink` | `#fff` | 52 | 14 | step advance, شروع رایگان |
| Primary blue | `--primary` | `#fff` | 54 | 14 | irreversible submit only |
| Secondary | `#fff` + hairline | `--text` | 52 | 14 | alternate CTA |
| Row | `#fff` + hairline | `--text-2` | auto | 12–13 | list/field rows |
| Text | none | `--text-4` | 34 | — | رد کردن، لغو |
| Icon | none / hairline | `--text-3` | 36–38 | 50% | header actions |

Press state: `transform: scale(.985)`, 120ms ease. No color change on press.
Every interactive target ≥ 44×44 including padding.

### Pills and badges

Radius pill. Verdict pills: Vazirmatn 10/800, hue text on hue-soft fill, padding `3px 8px`.
Filter/domain chips: Vazirmatn 11.5–12/600–700, padding `7px 12px`–`8px 13px`.
Eyebrow labels: Vazirmatn 10/800, `--text-3` on `--bg-muted`, padding `4px 10px`.

### Gate strip

Five pills, 16×5px (14×4px in compact contexts), 4px gap, radius 999px, each in the gate's
verdict hue. Reused in history rows and explore cards. Give the container
`role="img"` and an `aria-label` spelling out the five verdicts — the color alone is not
accessible.

---

## Interactions and behavior

**Navigation.** Tab switches are instant, no transition. Push navigation (row → detail,
step 1 → step 2) slides in from the inline-start edge, 220ms `cubic-bezier(.32,.72,0,1)`;
back reverses it. Preserve scroll position per tab.

**Two-step form.** Step 1 validates ≥20 chars before enabling advance. Step 2 is entirely
optional. Persist a draft to `localStorage` on every input (debounce 400ms) under a single
key you own; restore on load and clear on successful submit. Back from step 2 must not lose
step 1 text.

**Submission.** On submit, replace the view with 1c. Stream progress into the gate bars and
the status line from the existing analysis endpoint. `لغو` aborts the request and returns
to step 2 with all input intact.

**Result disclosure.** Gate cards expand/collapse with a height transition, 200ms ease.
Chevron rotates 180°. Expansion state persists per analysis id.

**History.** Search filters client-side on the loaded page, server-side beyond it — same as
today. Filter chips are single-select. Swipe-to-reveal actions: 
translate the row on `touchmove`, snap open at 40% of the action width, close on tap elsewhere.

**Loading.** Skeletons, not spinners, for list and detail loads: `--bg-muted` blocks at the
real content's dimensions, radius matching the element, with a 1.4s shimmer
(`linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent)` sweeping
`background-position`). Suppress shimmer under reduced-motion.

**Errors.** Inline under the field for validation. For failed requests, a card in place of
the content — hairline, `--danger` inline-start border, message in `--text-2`, and a
retry button. Never a modal alert.

**Reduced motion.** `@media (prefers-reduced-motion: reduce)` must kill: the breathing
glows, the quote cross-fade, the shimmer, and the page slide transitions. Keep the spinner
(it conveys state) but slow it to 3s.

**Responsive.** These are phone designs. At ≥768px, cap the content column at 640px and
center it; move the tab bar to a left rail or restore the topbar — your call, but do not
stretch phone layouts across a desktop viewport. The existing desktop layouts can stay as
they are above that breakpoint.

---

## State

Nothing here needs a state library. What the screens require:

- `draft` — `{ dilemma, domain, urgency, stakeholders, options, values, model }`,
  persisted to `localStorage`, cleared on submit success.
- `step` — `1 | 2`, plus `analysisState` — `idle | running | done | error`.
- `progress` — `{ percent, currentGate }` from the stream.
- `activeTab` — reflected in the URL so back/forward and the PWA launch URL behave.
- `expandedGates` — `Set<gateId>` per analysis id, `localStorage`.
- `historyFilter` — `all | bookmarked | pending | published` + `query`.
- `installPrompt` — the deferred `beforeinstallprompt` event, or null.

Data fetching is unchanged from today: same endpoints, same payload shape, same
`core.js` API helper.

---

## PWA

Files in this bundle: `manifest.webmanifest`, `service-worker.js`, `pwa-snippet.html`.

- **Manifest:** `display: standalone`, `dir: rtl`, `lang: fa`, `start_url: /app`,
  `theme_color: #f5f5f4`, `background_color: #f5f5f4`. Icons at 192/512 plus a 512
  maskable — you'll need to export these from the brand mark (dark `--ink` rounded square,
  white compass); they are not in this bundle.
- **Service worker:** cache-first for the app shell and static assets, network-first for
  API calls, and an offline read path for previously-viewed analyses. Bump `CACHE` on
  every deploy. It is deliberately conservative — read it before shipping.
- **Safe areas:** `viewport-fit=cover` in the meta tag, then `env(safe-area-inset-*)`
  on the tab bar bottom padding and the status-bar spacer.
- **Standalone detection:** `window.matchMedia('(display-mode: standalone)').matches` —
  hide the install bar and any "open in browser" affordances when true.

---

## Assets

- **Fonts:** Vazirmatn (already in use) + Markazi Text, both Google Fonts.
  Self-host if you care about the first-paint on Iranian networks — both are OFL.
- **Icons:** Lucide, inline SVG. No icon font. All emoji removed.
- **Images:** none. The designs use no photography or illustration.
- **App icons:** not included — export from the brand mark at 192, 512, and 512-maskable.

## Files

**In this bundle**
- `Ethic Lens Mobile PWA.dc.html` — the redesign, screens 1a–1h
- `Ethic Lens — Current Screens.dc.html` — today's app recreated at 390px
- `tokens.css` — the token block above, ready to paste
- `manifest.webmanifest`, `service-worker.js`, `pwa-snippet.html`

**In your repo, touched by this work**
- `public/css/app.css` — token replacement, tab bar, button/pill/card primitives
- `public/css/result.css` — rewritten for the verdict-first result page
- `public/css/public.css` — landing
- `public/css/motion.css` — breathe/orbit/shimmer keyframes, reduced-motion guards
- `public/pages/app.html` — split into the two-step form + waiting state
- `public/pages/analysis.html` — verdict-first restructure
- `public/pages/history.html` — filter chips, gate strip, swipe actions
- `public/index.html` — landing + install bar
- `public/js/core.js` — tab bar rendering, install prompt, standalone detection
- `public/js/result.js` — gate ladder, expansion persistence
- `public/js/quotes.js` — unchanged, consumed by the waiting screen
- `server/services/schools.js` — **unchanged**, and the source of truth for the eight
  hues and the five gate names. Do not fork these values into CSS by hand; generate the
  `--school-*` block from it if you can.

## Not covered

Settings, admin panel, dashboard, and about were out of scope. They inherit the tokens and
the tab-bar shell, but their layouts have not been redesigned — treat them as a follow-up.
