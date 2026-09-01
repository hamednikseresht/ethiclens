/* ==========================================================================
   Google Analytics (GA4).

   Kept in one file rather than pasted into a dozen page heads, so the
   measurement id has a single home and the whole thing can be switched off
   by deleting one line.

   Loaded as a classic script (not a module) so it runs immediately rather
   than waiting for the module graph — analytics that fires late under-counts
   people who leave quickly.

   Note: the site's Content-Security-Policy in server/index.js must allow
   googletagmanager.com and google-analytics.com. Without those entries the
   browser blocks this silently and no data ever arrives.
   ========================================================================== */
(function () {
  var ID = 'G-5ZGCBMM5RY';

  // Respect an explicit opt-out. Not required for GA to work, but it costs
  // nothing to honour and this product handles personal dilemmas.
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', ID);
})();
