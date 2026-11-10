'use client';

import { type RefObject, useLayoutEffect, useRef } from 'react';

/**
 * FLIP for a list whose order changes: every child marked `data-flip={key}`
 * slides from where it was to where it is now. Runs in the browser's
 * compositor, and the global reduced-motion rule shortens it to nothing.
 */
export function useFlip<T extends HTMLElement>(ref: RefObject<T | null>, order: string) {
  const last = useRef(new Map<string, number>());
  // biome-ignore lint/correctness/useExhaustiveDependencies: `order` is the trigger; the effect reads the DOM, which changes with it
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, number>();
    for (const el of root.querySelectorAll<HTMLElement>('[data-flip]')) {
      const key = el.dataset.flip ?? '';
      const top = el.getBoundingClientRect().top;
      next.set(key, top);
      const before = last.current.get(key);
      if (before === undefined) continue;
      const dy = before - top;
      if (Math.abs(dy) > 0.5) {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
          duration: 420,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        });
      }
    }
    last.current = next;
  }, [ref, order]);
}
