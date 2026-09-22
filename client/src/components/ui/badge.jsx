import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-foreground text-background',
        secondary:   'border-transparent bg-muted text-foreground',
        outline:     'border-border text-muted-foreground',
        destructive: 'border-transparent bg-destructive-soft text-destructive',
        ok:          'border-transparent bg-ok-soft text-ok',
        warn:        'border-transparent bg-warn-soft text-warn'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
