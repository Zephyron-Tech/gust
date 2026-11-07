'use client';

import { type Deployment, RUNNING_STATES } from '@gust/contracts';
import { ArrowCounterClockwise, Check, X } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { use, useEffect, useRef } from 'react';

import { btn, Code, cx, Pill } from '@/components/ui';
import { useDemo } from '@/lib/demo';
import { ago } from '@/lib/format';

const PHASES = ['Queued', 'Pull image', 'Start', 'Health check', 'Live'];

function phase(d: Deployment) {
  if (d.state === 'failed') return 3;
  if (d.state === 'live' || d.state === 'superseded') return 5;
  return ['queued', 'pulling', 'starting', 'healthy'].indexOf(d.state);
}

export default function DeploymentPage({ params }: { params: Promise<{ slug: string; service: string; id: string }> }) {
  const { slug, service, id } = use(params);
  const { deployments, deploy, busy } = useDemo();
  const d = deployments.find((x) => x.id === id);
  const logRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lines = d?.logs.length ?? 0;

  // Follow the log while the reader stays at the bottom; leave it alone once they scroll up.
  useEffect(() => {
    const el = logRef.current;
    if (el && pinned.current && lines) el.scrollTop = el.scrollHeight;
  }, [lines]);

  if (!d) {
    return (
      <p className="text-fg-2">
        This deployment is not in the sample data.{' '}
        <Link className="text-accent" href={`/projects/${slug}/${service}/deployments`}>
          Back to deployments
        </Link>
      </p>
    );
  }

  const pi = phase(d);
  const running = RUNNING_STATES.includes(d.state);

  return (
    <div className="view-in space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <Pill state={d.state} />
            <h2 className="truncate text-[24px] leading-tight">{d.message}</h2>
          </div>
          <p className="text-[14px] text-fg-3">
            <Code>{d.id}</Code> · <Code>{d.sha}</Code> · {d.author} · {d.trigger === 'rollback' ? 'rollback' : `push to ${d.branch}`} ·{' '}
            {ago(d.createdAt)}
            {d.duration ? ` · ${d.duration}` : ''}
          </p>
        </div>
        {d.state === 'superseded' && (
          <button type="button" className={btn.secondary} disabled={busy(slug, service)} onClick={() => deploy(slug, service, d)}>
            <ArrowCounterClockwise /> Roll back to this
          </button>
        )}
      </div>

      <ol className="grid grid-cols-5 overflow-hidden rounded-2xl border border-line bg-bg-2">
        {PHASES.map((n, i) => {
          const state = d.state === 'failed' && i === pi ? 'bad' : i < pi ? 'done' : i === pi ? 'cur' : 'wait';
          return (
            <li key={n} className={cx('relative grid gap-1 px-5 py-4', i < 4 && 'border-r border-line')}>
              <span
                className={cx(
                  'flex items-center gap-2 text-[14.5px] font-medium',
                  state === 'done' && 'text-ok',
                  state === 'cur' && 'text-warn',
                  state === 'bad' && 'text-err',
                  state === 'wait' && 'text-fg-2',
                )}
              >
                {state === 'done' && <Check size={16} weight="bold" />}
                {state === 'bad' && <X size={16} weight="bold" />}
                {n}
              </span>
              <span className={cx('text-[13.5px]', state === 'wait' ? 'text-fg-3' : 'text-fg-2')}>
                {state === 'done' ? 'done' : state === 'cur' ? 'in progress' : state === 'bad' ? 'failed' : 'waiting'}
              </span>
              {state === 'cur' && <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-pulse bg-warn" />}
            </li>
          );
        })}
      </ol>

      {d.error && (
        <p className="rounded-2xl border border-err/35 bg-err/10 px-5 py-3.5 text-[14.5px]">
          {d.error}. The previous deployment is still live.
        </p>
      )}

      <div
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="h-[460px] overflow-auto rounded-2xl border border-line bg-log px-6 py-5 font-mono text-[13px] leading-[1.8] text-[#d6d5e4]"
      >
        {d.logs.map((l, i) => {
          const bad = l.phase === 'fail' || / 503 |no healthy/.test(l.line);
          const good = l.phase === 'live' || / 200 /.test(l.line);
          return (
            <div key={i} className="grid grid-cols-[76px_64px_1fr] gap-4">
              <span className="text-[#5d5c74]">{l.ts}</span>
              <span className={l.phase === 'fail' ? 'text-[#ff7480]' : l.phase === 'live' ? 'text-[#4fd08f]' : 'text-[#8b80ff]'}>
                {l.phase}
              </span>
              <span className={bad ? 'text-[#ff7480]' : good ? 'text-[#4fd08f]' : undefined}>{l.line}</span>
            </div>
          );
        })}
        {running && <span className="inline-block h-3.5 w-[7px] animate-pulse bg-[#8b80ff] align-[-2px]" />}
      </div>
    </div>
  );
}
