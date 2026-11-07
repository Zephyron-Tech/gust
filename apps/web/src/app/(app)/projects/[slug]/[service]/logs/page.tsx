'use client';

import { use, useEffect, useRef, useState } from 'react';

import { clock } from '@/lib/format';

const SAMPLE = [
  'GET /v1/targets?plan=q4 200 18ms',
  'POST /v1/targets/sync 202 41ms',
  'sync job enqueued (3 plans)',
  'GET /healthz 200 1ms',
  'sync job done in 4.8s',
  'GET /v1/plans 200 12ms',
  'slow query 412ms: SELECT … FROM targets WHERE plan_id = $1',
];

// Runtime logs of the service. The engine will stream them over SSE; until
// then a line arrives every second and a half.
export default function LogsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { service } = use(params);
  const [lines, setLines] = useState<{ ts: string; line: string }[]>(() =>
    SAMPLE.slice(0, 5).map((line, i) => ({ ts: `15:40:0${i + 2}`, line })),
  );
  const [paused, setPaused] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;
    let i = 0;
    const id = window.setInterval(() => {
      setLines((l) => [...l.slice(-200), { ts: clock(), line: SAMPLE[i++ % SAMPLE.length] ?? '' }]);
    }, 1500);
    return () => clearInterval(id);
  }, [paused]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll again whenever a new line arrives
  useEffect(() => {
    const el = box.current;
    if (el && !paused) el.scrollTop = el.scrollHeight;
  }, [lines, paused]);

  return (
    <div className="view-in space-y-3">
      <div className="flex items-center gap-3 text-[13px] text-fg-3">
        <span className="rounded-md bg-bg-3 px-2 py-1 font-mono text-[12px] text-fg-2">{service}</span>
        <span>{paused ? 'Paused' : 'Following runtime logs'}</span>
        <button type="button" onClick={() => setPaused((p) => !p)} className="ml-auto text-accent">
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <div
        ref={box}
        className="h-[480px] overflow-auto rounded-xl border border-line bg-log px-5 py-4 font-mono text-[12.5px] leading-[1.75] text-[#d6d5e4]"
      >
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[72px_56px_1fr] gap-3">
            <span className="text-[#5d5c74]">{l.ts}</span>
            <span className={l.line.startsWith('slow') ? 'text-[#f0bd55]' : 'text-[#8b80ff]'}>
              {l.line.startsWith('slow') ? 'warn' : service}
            </span>
            <span>{l.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
