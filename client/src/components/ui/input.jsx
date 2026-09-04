import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Height is 44px rather than shadcn's 36px — the handoff's touch-target floor.
 * Font size stays at 16px on mobile because anything smaller makes iOS Safari
 * zoom the viewport when the field takes focus, which throws off the layout.
 */
const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base',
      'placeholder:text-text-5 focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
