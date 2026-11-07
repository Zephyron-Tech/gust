'use client';

import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A single-series area chart in the app's accent, drawn with uPlot. */
export function Chart({ data, max, unit, forecast }: { data: number[]; max: number; unit: string; forecast?: number }) {
  const box = useRef<HTMLDivElement>(null);
  // Redraw with the other palette when the theme switches.
  const [theme, setTheme] = useState('');
  useEffect(() => {
    const html = document.documentElement;
    setTheme(html.dataset.theme ?? '');
    const mo = new MutationObserver(() => setTheme(html.dataset.theme ?? ''));
    mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: theme is read through CSS variables, so it must retrigger the draw
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const accent = css('--g-accent');
    const grid = css('--g-line');
    const text = css('--g-fg-3');
    const xs = data.map((_, i) => i);
    const ys = [...data];
    const fc: (number | null)[] = data.map(() => null);
    if (forecast !== undefined) {
      fc[fc.length - 1] = data[data.length - 1] ?? null;
      xs.push(data.length + Math.round(data.length * 0.2));
      ys.push(Number.NaN);
      fc.push(forecast);
    }
    const plot = new uPlot(
      {
        width: el.clientWidth,
        height: 140,
        cursor: { show: false },
        legend: { show: false },
        scales: { x: { time: false }, y: { range: [0, max] } },
        axes: [
          { show: false },
          {
            stroke: text,
            size: 44,
            grid: { stroke: grid, width: 1 },
            ticks: { show: false },
            values: (_, v) => v.map((n) => `${n}${unit === '%' ? ' %' : ''}`),
            font: '12px -apple-system, system-ui, sans-serif',
          },
        ],
        series: [
          {},
          { stroke: accent, width: 1.8, fill: `${accent}22`, points: { show: false }, spanGaps: false },
          { stroke: text, width: 1.4, dash: [4, 4], points: { show: false }, spanGaps: true },
        ],
      },
      [xs, ys.map((v) => (Number.isNaN(v) ? null : v)), fc] as uPlot.AlignedData,
      el,
    );
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height: 140 }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
    };
  }, [data, max, unit, forecast, theme]);

  return <div ref={box} className="w-full" aria-hidden />;
}
