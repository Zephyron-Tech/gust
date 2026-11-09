'use client';

import { environmentOf } from '@gust/contracts';
import { useEffect, useRef, useState } from 'react';

import { EnvBadge } from '@/components/EnvBadge';
import { Segmented } from '@/components/Segmented';
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

// How long to wait for the engine to open the stream before saying so.
const ENGINE_SILENT_MS = 15_000;

// Runtime logs of the service. Real projects stream from the engine (Docker
// logs over SSE); sample projects get a line every second and a half.
export function LogsView({ slug, service, engine }: { slug: string; service: string; engine: boolean }) {
  const { deployments } = useDemo();
  // One stream per environment: production, or the preview of a branch. The
  // newest live deployment of each is the one running.
  const live = deployments.filter((d) => d.project === slug && d.service === service && d.state === 'live');
  const envs: string[] = [];
  for (const d of live) {
    const env = environmentOf(d);
    const key = env.kind === 'production' ? 'production' : env.branch;
    if (!envs.includes(key)) envs.push(key);
  }
  if (!envs.includes('production')) envs.unshift('production');
  envs.sort((a, b) => (a === 'production' ? -1 : b === 'production' ? 1 : a.localeCompare(b)));
  const [envKey, setEnvKey] = useState('production');
  const containerId = live.find((d) => {
    const env = environmentOf(d);
    return envKey === 'production' ? env.kind === 'production' : env.kind === 'preview' && env.branch === envKey;
  })?.containerId;
  const [lines, setLines] = useState<Line[]>(() => (engine ? [] : SAMPLE.slice(0, 5).map((line, i) => ({ ts: `15:40:0${i + 2}`, line }))));
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState(engine ? 'Connecting to the container…' : 'Following runtime logs');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engine || paused) return;
    if (!containerId) {
      setStatus('No running container in this environment yet.');
      return;
    }
    setLines([]);
    setStatus('Connecting to the container…');
    let opened = false;
    // If the engine never answers, say so instead of waiting forever.
    const silent = window.setTimeout(() => {
      if (!opened) setStatus('The engine did not answer. On the server run: gust status, then gust logs engine');
    }, ENGINE_SILENT_MS);
    const es = new EventSource(`/api/engine/logs/${containerId}`);
    es.addEventListener('open', () => {
      opened = true;
      window.clearTimeout(silent);
      setStatus(`Following container ${containerId.slice(0, 12)}`);
    });
    es.addEventListener('log', (e) => {
      const raw = (e as MessageEvent<string>).data;
      // Docker prefixes each line with an RFC 3339 timestamp.
      const m = /^(\S+)\s(.*)$/.exec(raw);
      const ts = m?.[1] ? new Date(m[1]).toLocaleTimeString('en-GB', { hour12: false }) : clock();
      setLines((l) => [...l.slice(-500), { ts, line: m?.[2] ?? raw }]);
    });
    es.addEventListener('error', () => {
      window.clearTimeout(silent);
      setStatus('Log stream closed. The container may have been replaced, or the engine is unreachable.');
    });
    return () => {
      window.clearTimeout(silent);
      es.close();
    };
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
      {envs.length > 1 && (
        <Segmented
          options={envs}
          value={envKey}
          onChange={setEnvKey}
          label="Environment"
          format={(k) => (k === 'production' ? 'Production' : `Preview · ${k}`)}
        />
      )}
      <div className="flex items-center gap-3 text-[14px] text-fg-3">
        <EnvBadge env={envKey === 'production' ? { kind: 'production' } : { kind: 'preview', branch: envKey }} />
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
