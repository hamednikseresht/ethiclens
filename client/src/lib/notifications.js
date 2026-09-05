import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * What is waiting for the admin's attention, kept fresh while the app is open.
 *
 * Polled rather than pushed: the only thing being watched is a small integer,
 * the product has no socket layer, and adding one to carry a count nobody
 * looks at more than once a minute would be a lot of machinery for very
 * little.
 *
 * The interval is paused while the tab is hidden. A phone left on a screen
 * for a day would otherwise wake to make the same request a thousand times
 * for an answer nobody is there to read.
 */
const EVERY_MS = 60_000;

export function useAdminNotifications(enabled) {
  const [counts, setCounts] = useState({ pendingUsers: 0 });

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const d = await api.get('/api/admin/notifications');
        if (alive) setCounts(d);
      } catch { /* a failed poll is not worth surfacing; the next one retries */ }
    };

    load();
    const timer = setInterval(load, EVERY_MS);
    // Checked again on return, so someone coming back to the tab sees the
    // current number rather than whatever it was when they left.
    document.addEventListener('visibilitychange', load);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [enabled]);

  return counts;
}
