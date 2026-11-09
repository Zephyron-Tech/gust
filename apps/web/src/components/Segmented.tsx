'use client';

import { useIndicator } from '@/lib/useIndicator';
import { cx } from './ui';

/** A small segmented control whose highlight slides to the chosen option. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  format,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** Text shown for an option; without it the option itself, capitalised. */
  format?: (v: T) => string;
}) {
  const { ref, style } = useIndicator<HTMLFieldSetElement>(value);
  return (
    <fieldset ref={ref} aria-label={label} className="relative flex w-max gap-1 rounded-xl border border-line bg-bg-2 p-1">
      <span aria-hidden className="absolute top-0 left-0 rounded-lg bg-bg-3 shadow-[0_1px_2px_rgb(0_0_0/0.2)]" style={style('fill')} />
      {options.map((o) => (
        <button
          key={o}
          type="button"
          data-key={o}
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cx(
            'relative rounded-lg px-3.5 py-1.5 text-[14px] transition-colors duration-200',
            !format && 'capitalize',
            value === o ? 'text-fg' : 'text-fg-2 hover:text-fg',
          )}
        >
          {format ? format(o) : o}
        </button>
      ))}
    </fieldset>
  );
}
