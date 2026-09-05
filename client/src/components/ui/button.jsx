import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * shadcn's Button, with two changes for this product.
 *
 * Icon spacing uses logical properties (ms/me) instead of ml/mr, so an icon
 * sits before the label in Persian without a separate RTL stylesheet.
 *
 * Heights start at 44px on the default size. The handoff sets that floor for
 * touch targets, and the stock shadcn 36px default is below it.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:     'bg-ink text-background hover:bg-ink-2',
        primary:     'bg-primary text-primary-foreground hover:opacity-90',
        outline:     'border border-border-strong bg-card hover:bg-muted',
        secondary:   'bg-muted text-foreground hover:bg-border',
        ghost:       'hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        link:        'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm:      'h-9 rounded-sm px-3 text-xs',
        lg:      'h-12 rounded-lg px-8 text-base',
        icon:    'h-11 w-11'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
