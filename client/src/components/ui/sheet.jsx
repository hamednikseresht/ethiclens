import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * A bottom sheet.
 *
 * Bottom rather than centred: these hold forms, and on a phone a centred
 * dialog puts its fields under the keyboard the moment one takes focus.
 *
 * Escape closes it and the background scroll is frozen while it is open —
 * without that, dragging inside a short sheet scrolls the page behind it and
 * the form appears to drift off-screen.
 */
export function Sheet({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-foreground/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
           className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-card"
           style={{ boxShadow: '0 -8px 24px rgba(28,25,23,.10)' }}
           onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-5 py-3.5">
          <h2 className="grow text-sm font-bold">{title}</h2>
          <button onClick={onClose} aria-label="بستن"
                  className="grid size-8 place-items-center rounded-full text-text-4 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="sticky bottom-0 border-t border-border bg-card px-5 py-3"
               style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
