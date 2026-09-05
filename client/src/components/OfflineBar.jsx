import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Says when the connection is gone.
 *
 * Installed on a home screen there is no browser chrome to show it, so
 * without this an offline app looks like a broken one: taps do nothing and
 * every request fails with a message about the server.
 *
 * navigator.onLine only knows whether an interface is up, not whether it
 * reaches anything — it is wrong optimistically on captive portals. That is
 * the acceptable direction to be wrong in: a false "online" leaves the
 * ordinary error messages in place, while a false "offline" would tell
 * someone their working connection is broken.
 */
export function OfflineBar() {
  const [offline, setOffline] = useState(() => navigator.onLine === false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div role="status"
         className="flex items-center justify-center gap-2 bg-warn px-4 py-1.5 text-[11.5px] font-bold text-white">
      <WifiOff className="size-3.5" />
      اتصال اینترنت قطع است
    </div>
  );
}
