'use client';

import { projects } from '@gust/contracts/sample';
import { use, useEffect, useRef, useState } from 'react';

import { useDemo } from '@/lib/demo';
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

type Line = { ts: string; line: string };

// Runtime logs of the service. Real projects stream from the engine (Docker
// logs over SSE); sample projects get a line every second and a half.
export default function LogsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = use(params);
  const engine = projects.some((p) => p.slug === slug && p.engine);
  const { deployments } = useDemo();
  const containerId = deployments.find((d) => d.project === slug && d.service === service && d.state === 'live')?.containerId;
  const [lines, setLines] = useState<Line[]>(() => (engine ? [] : SAMPLE.slice(0, 5).map((line, i) => ({ ts: `15:40:0${i + 2}`, line }))));
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState(engine ? 'Connecting to the container…' : 'Following runtime logs');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engine || paused) return;
    if (!containerId) {
      setStatus('No running container for this service yet.');
      return;
    }
    setLines([]);
    const es = new EventSource(`/api/engine/logs/${containerId}`);
    es.addEventListener('open', () => setStatus(`Following container ${containerId.slice(0, 12)}`));
    es.addEventListener('log', (e) => {
      const raw = (e as MessageEvent<string>).data;
      // Docker prefixes each line with an RFC 3339 timestamp.
      const m = /^(\S+)\s(.*)$/.exec(raw);
      const ts = m?.[1] ? new Date(m[1]).toLocaleTimeString('en-GB', { hour12: false }) : clock();
      setLines((l) => [...l.slice(-500), { ts, line: m?.[2] ?? raw }]);
    });
    es.addEventListener('error', () => setStatus('Log stream closed. The container may have been replaced.'));
    return () => es.close();
  }, [engine, containerId, paused]);

  useEffect(() => {
    if (engine || paused) return;
    let i = 0;
    const id = window.setInterval(() => {
      setLines((l) => [...l.slice(-200), { ts: clock(), line: SAMPLE[i++ % SAMPLE.length] ?? '' }]);
    }, 1500);
    return () => clearInterval(id);
  }, [engine, paused]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll again whenever a new line arrives
  useEffect(() => {
    const el = box.current;
    if (el && !paused) el.scrollTop = el.scrollHeight;
  }, [lines, paused]);

  return (
    <div className="view-in space-y-4">
      <div className="flex items-center gap-3 text-[14px] text-fg-3">
        <span className="rounded-md bg-bg-3 px-2 py-1 text-[13px] font-medium text-fg-2">{service}</span>
        <span>{paused ? 'Paused' : status}</span>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="ml-auto rounded-lg px-2 py-1 font-medium text-accent transition-colors duration-150 hover:bg-accent-soft active:bg-accent-soft/70"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <div
        ref={box}
        className="h-[520px] overflow-auto rounded-2xl border border-line bg-log px-6 py-5 font-mono text-[13px] leading-[1.8] text-[#d6d5e4]"
      >
        {lines.map((l, i) => (
          <div key={i} className="log-in grid grid-cols-[76px_56px_1fr] gap-4">
            <span className="text-[#5d5c74]">{l.ts}</span>
            <span className={l.line.startsWith('slow') ? 'text-[#f0bd55]' : 'text-[#8b80ff]'}>
              {l.line.startsWith('slow') ? 'warn' : service}
            </span>
            <span className="break-all">{l.line}</span>
          </div>
        ))}
        {engine && lines.length === 0 && <p className="text-[#5d5c74]">Waiting for output…</p>}
      </div>
    </div>
  );
}
