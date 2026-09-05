import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Page views for a single-page app.
 *
 * The tag itself is loaded by /js/analytics.js, the same file the
 * server-rendered pages use — so the measurement id has one home and the
 * opt-out check is written once. All that is missing here is the part a
 * classic page gets for free: a document load per screen.
 *
 * Without this the app reports one view per session no matter how many
 * screens someone opens, because the document never changes.
 *
 * The first navigation is skipped on purpose. gtag('config') already counts
 * the landing screen as it initialises, and sending our own would double it.
 */
export function PageViews() {
  const { pathname, search } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // Absent when the tag was blocked, or when the visitor opted out of
    // tracking — in which case there is deliberately nothing to send to.
    if (typeof window.gtag !== 'function') return;

    window.gtag('event', 'page_view', {
      page_path: pathname + search,
      page_title: document.title,
      page_location: window.location.href
    });
  }, [pathname, search]);

  return null;
}
