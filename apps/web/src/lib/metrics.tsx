'use client';

// Sample server metrics: a slow random walk every 2 s, standing in for the
// VictoriaMetrics queries the worker and UI will make.
import { containers as seedContainers } from '@gust/contracts/sample';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

export interface Live {
  cpu: number;
  ramGb: number;
  load: number;
  steal: number;
  netIn: number;
  netOut: number;
  containers: typeof seedContainers;
}

const start: Live = { cpu: 14, ramGb: 5.1, load: 0.82, steal: 1.4, netIn: 2.1, netOut: 3.4, containers: seedContainers };
const walk = (v: number, step: number, min: number, max: number) => Math.min(max, Math.max(min, v + (Math.random() - 0.5) * step));

const Ctx = createContext<Live>(start);
export const useLive = () => useContext(Ctx);

export function MetricsProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState<Live>(start);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setM((x) => ({
        cpu: walk(x.cpu, 6, 6, 38),
        ramGb: walk(x.ramGb, 0.12, 4.8, 5.6),
        load: walk(x.load, 0.25, 0.4, 1.9),
        steal: walk(x.steal, 0.6, 0.4, 3.2),
        netIn: walk(x.netIn, 1.2, 0.3, 8),
        netOut: walk(x.netOut, 1.6, 0.4, 11),
        containers: x.containers.map((c) => ({
          ...c,
          cpu: walk(c.cpu, 1, 0.1, 9),
          memoryMb: walk(c.memoryMb, 6, c.memoryMb * 0.95, c.memoryMb * 1.05),
        })),
      }));
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return <Ctx.Provider value={m}>{children}</Ctx.Provider>;
}

/** Deterministic history curve for charts: same shape on every render. */
export function series(seed: number, n: number, base: number, swing: number, trend = 0) {
  let x = seed;
  const rnd = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  return Array.from({ length: n }, (_, i) => base + trend * i + Math.sin(i / 5 + seed) * swing * 0.5 + (rnd() - 0.5) * swing);
}
