/**
 * Move a finished build over the served directory.
 *
 * Vite empties its output directory before it begins, so it builds into
 * public/app.next and this runs only after it exits zero. The live directory
 * is therefore replaced in one step by something already known to be
 * complete, instead of being emptied and refilled while the server is
 * serving from it.
 *
 * The previous build is kept as public/app.prev until the swap succeeds, so a
 * failure here still leaves a working directory to restore by hand.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const next = path.join(root, 'public', 'app.next');
const live = path.join(root, 'public', 'app');
const prev = path.join(root, 'public', 'app.prev');

if (!fs.existsSync(path.join(next, 'index.html'))) {
  console.error('  ✗ build output is missing index.html — refusing to swap');
  process.exit(1);
}

fs.rmSync(prev, { recursive: true, force: true });
if (fs.existsSync(live)) fs.renameSync(live, prev);

try {
  fs.renameSync(next, live);
} catch (err) {
  // Put the old build back rather than leaving nothing served.
  if (fs.existsSync(prev) && !fs.existsSync(live)) fs.renameSync(prev, live);
  console.error('  ✗ swap failed:', err.message);
  process.exit(1);
}

fs.rmSync(prev, { recursive: true, force: true });

const files = fs.readdirSync(path.join(live, 'assets')).length;
console.log(`  ✓ build swapped in (${files} assets)`);
