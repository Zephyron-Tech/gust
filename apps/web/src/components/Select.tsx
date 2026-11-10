'use client';

import { Select as BaseSelect } from '@base-ui/react/select';
import { CaretDown, Check } from '@phosphor-icons/react/ssr';

import { cx } from '@/components/ui';

export type SelectOption = { value: string; label: string };

/**
 * Gust's dropdown: Base UI for keyboard, focus and positioning, styled like the
 * account menu. Use it everywhere a native select would appear.
 */
export function Select({
  value,
  onValueChange,
  options,
  label,
  className,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name, shown nowhere else. */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <BaseSelect.Root
      value={value}
      items={items}
      disabled={disabled}
      onValueChange={(v) => {
        if (typeof v === 'string') onValueChange(v);
      }}
    >
      <BaseSelect.Trigger
        aria-label={label}
        className={cx(
          'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-[10px] border border-line bg-bg px-3 text-left text-[14.5px] outline-none transition-[border-color,background-color] duration-150 ease-[var(--ease-out)] hover:border-fg-3 focus-visible:border-accent data-popup-open:border-accent disabled:pointer-events-none disabled:opacity-45',
          className,
        )}
      >
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="shrink-0 text-fg-3 transition-transform duration-200 ease-[var(--ease-out)] data-popup-open:rotate-180">
          <CaretDown size={15} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50">
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] origin-[var(--transform-origin)] rounded-xl border border-raised-line bg-raised p-1.5 text-[14.5px] shadow-pop transition-[scale,opacity] duration-200 ease-[var(--ease-out)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {options.map((o) => (
              <BaseSelect.Item
                key={o.value}
                value={o.value}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-fg-2 outline-none transition-colors duration-100 data-highlighted:bg-bg-3 data-highlighted:text-fg data-selected:text-fg"
              >
                <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="text-accent">
                  <Check size={15} weight="bold" />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
