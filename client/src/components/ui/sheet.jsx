import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * A bottom sheet.
 *
 * Bottom rather than centred on a phone: these hold forms, and a centred
 * dialog there puts its fields under the keyboard the moment one takes focus.
 * On a desktop there is no keyboard to avoid and no thumb to reach with, so
 * it becomes an ordinary centred dialog with a width of its own.
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
    // Bottom sheet on a phone, centred dialog from md up. Anchored to the
    // bottom edge and full width, it spanned the whole of a desktop window —
    // a form built for a 375px screen stretched across 1440.
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/40
                    md:items-center md:p-6"
         onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
           className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-card
                      shadow-[0_-8px_24px_rgba(28,25,23,.10)]
                      md:max-h-[85vh] md:max-w-lg md:rounded-2xl
                      md:shadow-[0_12px_40px_rgba(28,25,23,.18)]"
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
