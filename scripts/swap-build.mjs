/**
 * Move a finished build over the served directory.
 *
 * Vite empties its output directory before it begins, so it builds into
 * client-dist.next and this runs only after it exits zero. The live directory
 * is therefore replaced in one step by something already known to be
 * complete, instead of being emptied and refilled while the server is
 * serving from it.
 *
 * The previous build is kept as client-dist.prev until the swap succeeds, so a
 * failure here still leaves a working directory to restore by hand.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const next = path.join(root, 'client-dist.next');
const live = path.join(root, 'client-dist');
const prev = path.join(root, 'client-dist.prev');

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

// The build used to land in public/v2 and was served from there. A server
// that has been running since before the move still has that directory, and
// express.static would keep answering /v2/assets/... from it instead of
// letting the redirect run. Removing it here means the next deploy cleans up
// after the move without anyone having to remember.
const legacy = path.join(root, 'public', 'v2');
if (fs.existsSync(legacy)) {
  fs.rmSync(legacy, { recursive: true, force: true });
  console.log('  ✓ removed the old public/v2 build directory');
}

const files = fs.readdirSync(path.join(live, 'assets')).length;
console.log(`  ✓ build swapped in (${files} assets)`);
