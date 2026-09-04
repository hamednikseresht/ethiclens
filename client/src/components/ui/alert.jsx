import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Colour carries meaning here, so each variant pairs a tinted background with
 * a matching border rather than relying on the icon alone — the analysis
 * result screens use the same three states for verdicts.
 */
const alertVariants = cva(
  'relative w-full rounded-md border px-4 py-3 text-sm leading-relaxed',
  {
    variants: {
      variant: {
        default:     'border-border bg-subtle text-text-2',
        destructive: 'border-destructive/30 bg-destructive-soft text-destructive',
        warn:        'border-warn/30 bg-warn-soft text-warn',
        ok:          'border-ok/30 bg-ok-soft text-ok'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

export { Alert, alertVariants };
