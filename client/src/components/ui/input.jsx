import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-[var(--shadow-xs)]',
      'placeholder:text-text-5 focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
