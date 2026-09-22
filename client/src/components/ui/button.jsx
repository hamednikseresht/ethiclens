import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * shadcn Button. Logical icon spacing (ms/me) for RTL. Default height is
 * 44px — the touch floor — rather than stock shadcn's 36px.
 */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ' +
  'shadow-[var(--shadow-xs)] transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary-hover',
        primary:     'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline:     'border border-border bg-card hover:bg-muted hover:text-foreground',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-accent-soft',
        ghost:       'shadow-none hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        inverse:     'bg-background text-foreground hover:bg-background/90',
        link:        'shadow-none text-foreground underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm:      'h-9 px-3.5 text-xs',
        lg:      'h-12 px-8',
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
