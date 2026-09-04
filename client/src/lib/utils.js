import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting a later Tailwind utility win over an earlier one
 * in the same group. Without this, passing `className="p-6"` to a component
 * whose base is `p-4` leaves both in the string and the winner depends on
 * stylesheet order rather than intent.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
