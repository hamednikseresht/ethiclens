import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

/**
 * Six-digit code entry, one box per digit.
 *
 * Split into separate boxes rather than one field because the codes arrive by
 * email and are usually pasted or copied a few digits at a time — separate
 * boxes make a wrong digit obvious at a glance.
 *
 * Three things this has to get right that a naive version misses:
 *
 *   Paste. People paste all six at once, so a paste into any box fills the
 *   whole row rather than dropping five digits.
 *
 *   Persian digits. The email renders the code in Persian numerals and
 *   copying it back yields ۰۱۲۳۴۵۶۷۸۹, which no numeric input accepts. They
 *   are converted on the way in, matching what the server already does.
 *
 *   Direction. The boxes read left-to-right even inside an RTL page: a code
 *   is a number, and reversing it is the kind of bug that looks like a wrong
 *   code rather than a layout fault.
 */

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

const toLatin = (s) =>
  String(s)
    .replace(/[۰-۹]/g, (d) => FA.indexOf(d))
    .replace(/[٠-٩]/g, (d) => AR.indexOf(d))
    .replace(/\D/g, '');

export function CodeInput({ length = 6, value, onChange, onComplete, disabled, autoFocus }) {
  const [digits, setDigits] = useState(() => Array(length).fill(''));
  const refs = useRef([]);

  // Let a parent reset the row (after a wrong code) by passing an empty value.
  useEffect(() => {
    if (value === '') setDigits(Array(length).fill(''));
  }, [value, length]);

  const push = (next) => {
    setDigits(next);
    const joined = next.join('');
    onChange?.(joined);
    if (joined.length === length && !next.includes('')) onComplete?.(joined);
  };

  const setAt = (i, raw) => {
    const clean = toLatin(raw);
    if (!clean) return;

    const next = [...digits];
    // A paste lands in one box but carries the whole code.
    for (let k = 0; k < clean.length && i + k < length; k++) next[i + k] = clean[k];
    push(next);

    const landed = Math.min(i + clean.length, length - 1);
    refs.current[landed]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = '';
      else if (i > 0) { next[i - 1] = ''; refs.current[i - 1]?.focus(); }
      push(next);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  return (
    <div className="flex justify-center gap-2" dir="ltr">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-14 w-11 rounded-md border border-input bg-card text-center text-xl font-bold nums',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50',
            d && 'border-primary'
          )}
        />
      ))}
    </div>
  );
}
