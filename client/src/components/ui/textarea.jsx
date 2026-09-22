import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[120px] w-full rounded-md border border-input bg-card px-3 py-3 text-base leading-loose',
      'shadow-[var(--shadow-xs)] placeholder:text-text-5',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'focus-visible:ring-offset-1 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
