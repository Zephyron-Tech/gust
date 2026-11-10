'use client';

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface IndicatorBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Measures the child marked `data-key={key}` inside the returned ref, so a
 * single highlight can slide between items instead of jumping. The first
 * placement is not animated; later moves are.
 */
export function useIndicator<T extends HTMLElement>(key: string | null, external?: RefObject<T | null>) {
  const own = useRef<T>(null);
  const ref = external ?? own;
  const [box, setBox] = useState<IndicatorBox | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = key ? root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : null;
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [key, ref]);

  useEffect(() => {
    if (!box || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [box, animate]);

  /**
   * `band`: a full-width highlight. Its width is the container's, so it follows a
   * container that is resizing (the sidebar) frame by frame; only its position and
   * height animate.
   */
  const style = (part: 'fill' | 'underline' | 'band'): React.CSSProperties | undefined => {
    if (!box) return undefined;
    if (part === 'band') {
      return {
        transform: `translateY(${box.y}px)`,
        left: 0,
        width: '100%',
        height: box.h,
        transition: animate ? 'transform 280ms var(--ease-out), height 280ms var(--ease-out), opacity 150ms var(--ease-out)' : 'none',
      };
    }
    const y = part === 'underline' ? box.y + box.h - 2 : box.y;
    return {
      transform: `translate(${box.x}px, ${y}px)`,
      width: box.w,
      height: part === 'underline' ? 2 : box.h,
      transition: animate
        ? 'transform 280ms var(--ease-out), width 280ms var(--ease-out), height 280ms var(--ease-out), opacity 150ms var(--ease-out)'
        : 'none',
    };
  };

  return { ref, box, style };
}
