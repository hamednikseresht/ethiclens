# EthicLens — design system

Source: Kinto Figma (`Kinto.fig`, pages Cover / Pages / Colors / Typography) interpreted for EthicLens. Stack: React 19, Vite, Tailwind v4, Radix, CVA, Lucide (shadcn shape).

## Verified matches (from the file, not the marketing page)

| Token | Figma | Applied as |
|---|---|---|
| Page paper | Home canvas fill `#F4F3EE` | `--bg` |
| Cream wash | Shadcn Colors `secondary` `#F8F4E7` | `--bg-muted`, `--primary-soft` |
| Warm inset | Home fill `#EDE9DF` | `--bg-sunken` |
| Gold highlight | Home text fill `#AD7A3B` (49 uses) | `--accent` on display `.hl` only |
| Soft gold | Home `#D9B951` | dark `--accent` |
| Ink CTA | Shadcn Colors `primary` `#18181B`; Home buttons 36–40px ink pills | `--primary`; buttons stay 44px for touch |
| Foreground | Home `#09090B` | `--text` |
| Cards | `card` → white | `--bg-raised` |
| Type | DM Serif Display 400 + DM Sans | **Shabnam stays** — no Google Fonts, CSP, Persian coverage |

## Deliberate overrides

- **Typeface stays Shabnam.** Kinto’s DM Serif Display / Inter / Geist have no Persian coverage, are blocked by CSP, and would be a CDN round-trip.
- **Do not copy Kinto source or copy.** Visual language only: cream paper, gold on large words, ink pills, floating cards.
- **Four primary tabs are unchanged.** Visual chrome only — pill header, floating mobile dock, same four destinations.
- **Gold is display-only.** `#AD7A3B` on `#F4F3EE` is ~3.3:1 — large text, not body.

## Tokens

Light: background `#F4F3EE`, card `#FFFFFF`, foreground `#09090B`, muted `#F8F4E7`, border `#E4E4E7`, primary `#18181B`, on-primary `#FAFAFA`, accent `#AD7A3B`, radius `1rem`.

Dark: background `#161412`, card `#221E1A`, foreground `#F4F3EE`, primary `#F4F3EE`, accent `#D9B951`.

School colours stay on `server/services/schools.js` and are not used as brand CTAs.

## Anti-patterns (do not reintroduce)

- Gradient text, gradient CTA bands, inverted ink CTA slabs, card `translateY` hover
- Letter-mark “EL” squares
- Emoji as navigation or lens icons
- `font-weight: 900` on UI chrome
- Blue `--primary` / `--primary-soft` pills
- Outfit / Inter / Work Sans / DM Serif / Google Fonts
