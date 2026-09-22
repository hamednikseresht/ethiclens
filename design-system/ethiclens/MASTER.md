# EthicLens — design system

Source: UI/UX Pro Max 2.13.0. Stack detected from `package.json`: React 19, Vite, Tailwind v4, Radix, CVA, Lucide (shadcn shape).

## Verified matches

| Decision | Source | Applied as |
|---|---|---|
| Style | Minimalism & Swiss Style (`--design-system`) | Hairline borders, grid, high contrast, no clay/glow |
| Product | Educational app had 0 close “dashboard” hits; retry `educational` returned Claymorphism. Museum/gallery “art-appropriate neutrals” is the usable sibling. Claymorphism is rejected — it reads as toy UI on an ethics tool. | Neutrals + eight school colours as exhibition accents only |
| Colour | Magazine/blog editorial (`#18181B` / `#FAFAFA` / `#E4E4E7`) | Shifted one step into stone (`#1C1917` / `#FAFAF9`) so it stays warm. Pink accent from that row is unused. |
| Motion | Dial 3/10 Subtle | 150–200ms colour transitions. No card lift, no hero parallax. |
| Density | Dial 6/10 | App gutters 20px, section gap 16px, 44px touch floor |
| Variance | Dial 4/10 Balanced | Centre column, not bento/brutalism |

## Deliberate overrides (not database defaults)

- **Typeface stays Shabnam.** Outfit + Work Sans have no Persian coverage, are blocked by CSP, and would be a CDN round-trip. Shabnam is already self-hosted (OFL).
- **Primary is ink, not `#0369A1`.** Navy + sky CTA is the generic SaaS look this pass is removing. shadcn’s default button is zinc-900 on white; that is the standard.
- **No Google Fonts import.** Do not add the CSS `@import` from the design-system search.
- **Four primary tabs are unchanged.** Visual chrome only.

## Tokens

Light: background `#FAFAF9`, card `#FFFFFF`, foreground `#0C0A09`, muted `#F5F5F4`, border `#E7E5E4`, primary `#1C1917`, on-primary `#FAFAF9`, ring = primary, destructive `#DC2626`.

Dark: background `#0C0A09`, card `#1C1917`, foreground `#FAFAF9`, primary `#FAFAF9`, on-primary `#1C1917`.

Radius `--radius: 0.625rem` with shadcn cascade (`sm` −4px, `md` −2px, `lg` = radius).

School colours stay on `server/services/schools.js` and are not used as brand CTAs.

## Anti-patterns (do not reintroduce)

- Gradient text, gradient CTA bands, card `translateY` hover
- Letter-mark “EL” squares
- Emoji as navigation or lens icons
- `font-weight: 900` on UI chrome
- Blue `--primary` / `--primary-soft` pills
- Outfit / Inter / Work Sans
