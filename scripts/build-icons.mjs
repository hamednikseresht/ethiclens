/**
 * Rasterise the product mark into the PNG sizes the platforms ask for.
 *
 *   node scripts/build-icons.mjs
 *
 * The SVG in public/icons is the source; every PNG here is derived from it,
 * so changing the mark means editing one file and re-running this. Committing
 * hand-made PNGs instead would leave six files that quietly drift from the
 * vector they came from.
 *
 * PNG rather than SVG in the manifest because the pieces that matter are
 * fussy about it: iOS reads only a PNG for apple-touch-icon, and Android's
 * maskable handling is reliable with raster and patchy with vector.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ICONS = path.resolve('public/icons');

/**
 * Each entry names its source, because the two differ in one deliberate way:
 * the maskable variant has square corners. Android crops it to whatever shape
 * the launcher uses, and rounding it ourselves first would round it twice.
 */
const TARGETS = [
  { src: 'mark.svg',          out: 'icon-192.png',          size: 192 },
  { src: 'mark.svg',          out: 'icon-512.png',          size: 512 },
  { src: 'mark.svg',          out: 'apple-touch-icon.png',  size: 180 },
  { src: 'mark.svg',          out: 'favicon-32.png',        size: 32  },
  { src: 'mark-maskable.svg', out: 'icon-maskable-192.png', size: 192 },
  { src: 'mark-maskable.svg', out: 'icon-maskable-512.png', size: 512 }
];

let total = 0;

for (const { src, out, size } of TARGETS) {
  const svgPath = path.join(ICONS, src);
  if (!fs.existsSync(svgPath)) {
    console.error(`  ✗ missing source: ${src}`);
    process.exit(1);
  }

  const png = new Resvg(fs.readFileSync(svgPath, 'utf8'), {
    fitTo: { mode: 'width', value: size },
    // The mark is flat colour on a solid ground, so no font loading is needed
    // and turning it off keeps the render deterministic across machines.
    font: { loadSystemFonts: false }
  }).render().asPng();

  fs.writeFileSync(path.join(ICONS, out), png);
  total += png.length;
  console.log(`  ${out.padEnd(26)} ${size}×${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`\n  ${TARGETS.length} icons, ${(total / 1024).toFixed(1)} KB total`);
