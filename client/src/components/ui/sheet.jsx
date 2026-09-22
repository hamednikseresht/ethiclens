import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * shadcn Sheet, laid out for this product: bottom on a phone (keyboard and
 * thumb), centred dialog from md up. Built on Radix Dialog so focus is
 * trapped and Escape closes it — the previous custom overlay did neither
 * reliably with assistive tech.
 */
function Sheet({ title, onClose, children, footer, open = true }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <DialogPrimitive.Content
          aria-label={title}
          className={cn(
            'fixed z-50 flex max-h-[88vh] w-full flex-col border border-border bg-card shadow-[var(--shadow-lg)]',
            'inset-x-0 bottom-0 rounded-t-xl',
            'md:inset-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:max-w-lg',
            'md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl'
          )}
        >
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <DialogPrimitive.Title className="grow text-sm font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="بستن"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="border-t border-border px-5 py-3"
                 style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { Sheet };
