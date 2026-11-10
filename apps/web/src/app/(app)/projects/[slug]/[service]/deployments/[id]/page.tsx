'use client';

import { type Deployment, environmentOf, RUNNING_STATES } from '@gust/contracts';
import { ArrowCounterClockwise, ArrowDown, ArrowSquareOut, Check, Copy, X } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { Ago } from '@/components/Ago';
import { EnvBadge } from '@/components/EnvBadge';
import { btn, Code, cx, Pill } from '@/components/ui';
import { useDemo, useDeploymentDetail } from '@/lib/demo';
import { triggerLabel } from '@/lib/deploy-labels';

const PHASES = ['Queued', 'Pull image', 'Start', 'Health check', 'Live'];

function phase(d: Deployment) {
  if (d.state === 'failed') return 3;
  if (d.state === 'live' || d.state === 'superseded') return 5;
  return ['queued', 'pulling', 'starting', 'healthy'].indexOf(d.state);
}

export default function DeploymentPage({ params }: { params: Promise<{ slug: string; service: string; id: string }> }) {
  const { slug, service, id } = use(params);
  const { deployments, deploy, busy, isEngine } = useDemo();
  const real = isEngine(slug);
  const detail = useDeploymentDetail(id, real);
  const listed = deployments.find((x) => x.id === id);
  // Real deploys: the polled row with its log. Once it has ended, the list entry
  // keeps the state fresh (live becomes superseded); while the list still says
  // "running" it is the older of the two, so the row's own state wins.
  const listedState = listed && !RUNNING_STATES.includes(listed.state) ? listed.state : undefined;
  const d = real ? (detail ? { ...detail, state: listedState ?? detail.state } : listed) : listed;
  const logRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [following, setFollowing] = useState(true);
  const [copied, setCopied] = useState(false);
  const lines = d?.logs.length ?? 0;

  // Follow the log while the reader stays at the bottom; leave it alone once they scroll up.
  useEffect(() => {
    const el = logRef.current;
    if (el && pinned.current && lines) el.scrollTop = el.scrollHeight;
  }, [lines]);

  if (!d) {
    return (
      <div className="fade-in space-y-6 [animation-delay:200ms]">
        {real ? (
          <div role="status" aria-busy="true" aria-label="Loading this deployment" className="space-y-6">
            <span className="skeleton block h-8 w-2/5" />
            <span className="skeleton block h-[74px] rounded-2xl" />
            <span className="skeleton block h-[460px] rounded-2xl" />
          </div>
        ) : (
          <p className="text-fg-2">This deployment is not in the sample data.</p>
        )}
        <Link className="text-[14px] text-accent" href={`/projects/${slug}/${service}/deployments`}>
          Back to deployments
        </Link>
      </div>
    );
  }

  const pi = phase(d);
  // What the failure note may promise: an older deploy of the same environment that still serves.
  const env = environmentOf(d);
  const previousLive = deployments.some(
    (x) =>
      x.project === slug &&
      x.service === service &&
      x.id !== d.id &&
      x.state === 'live' &&
      environmentOf(x).kind === env.kind &&
      (env.kind === 'production' || x.branch === d.branch),
  );
  const running = RUNNING_STATES.includes(d.state);

  return (
    <div className="view-in space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <Pill state={d.state} />
            <EnvBadge env={environmentOf(d)} />
            <h2 className="truncate text-[24px] leading-tight">{d.message}</h2>
          </div>
          <p className="text-[14px] text-fg-3">
            <Code>{d.id}</Code> · <Code>{d.sha}</Code> · {d.author} · {triggerLabel(d)} · <Ago iso={d.createdAt} />
            {d.duration ? ` · ${d.duration}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {d.previewUrl && (
            <a href={d.previewUrl} target="_blank" rel="noreferrer" className={btn.secondary}>
              Open preview <ArrowSquareOut />
            </a>
          )}
          {/* Rollbacks stay on production; a preview is replaced by the next push to its branch. */}
          {d.state === 'superseded' && environmentOf(d).kind === 'production' && (
            <button type="button" className={btn.secondary} disabled={busy(slug, service)} onClick={() => deploy(slug, service, d)}>
              <ArrowCounterClockwise /> Roll back to this
            </button>
          )}
        </div>
      </div>

      <ol className="grid grid-cols-5 overflow-hidden rounded-2xl border border-line bg-bg-2">
        {PHASES.map((n, i) => {
          const state = d.state === 'failed' && i === pi ? 'bad' : i < pi ? 'done' : i === pi ? 'cur' : 'wait';
          return (
            <li key={n} className={cx('relative grid gap-1 px-5 py-4', i < 4 && 'border-r border-line')}>
              <span
                className={cx(
                  'flex items-center gap-2 text-[14.5px] font-medium transition-colors duration-300',
                  state === 'done' && 'text-ok',
                  state === 'cur' && 'text-warn',
                  state === 'bad' && 'text-err',
                  state === 'wait' && 'text-fg-2',
                )}
              >
                {state === 'done' && <Check size={16} weight="bold" className="pop-in" />}
                {state === 'bad' && <X size={16} weight="bold" className="pop-in" />}
                {n}
              </span>
              <span className={cx('text-[13.5px]', state === 'wait' ? 'text-fg-3' : 'text-fg-2')}>
                {state === 'done' ? 'done' : state === 'cur' ? 'in progress' : state === 'bad' ? 'failed' : 'waiting'}
              </span>
              {state === 'cur' && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-warn/15">
                  <span className="indeterminate block h-full w-1/3 rounded-full bg-warn" />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {d.error && (
        <p className="fade-in rounded-2xl border border-err/35 bg-err/10 px-5 py-3.5 text-[14.5px]">
          {d.error.replace(/\.+$/, '')}.{' '}
          {previousLive
            ? 'The previous deployment is still live.'
            : environmentOf(d).kind === 'production'
              ? 'Nothing was live before this deploy, so the service is not serving yet.'
              : 'This preview has no earlier deploy to fall back on.'}
        </p>
      )}

      <div
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          pinned.current = atEnd;
          setFollowing(atEnd);
        }}
        className="h-[460px] overflow-auto rounded-2xl border border-line bg-log px-6 py-5 font-mono text-[13px] leading-[1.8] text-[#d6d5e4]"
      >
        <div className="sticky top-0 z-10 -mx-6 -mt-5 mb-3 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-log/95 px-6 py-2.5 font-sans text-[12.5px] text-[#8c8aa6] backdrop-blur">
          <span className="tabular-nums">
            {lines} {lines === 1 ? 'line' : 'lines'}
          </span>
          <span className="flex items-center gap-1">
            {!following && (
              <button
                type="button"
                onClick={() => {
                  const el = logRef.current;
                  if (el) el.scrollTop = el.scrollHeight;
                  pinned.current = true;
                  setFollowing(true);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[#d6d5e4] transition-colors hover:bg-white/[0.08]"
              >
                <ArrowDown size={13} /> Jump to end
              </button>
            )}
            <button
              type="button"
              disabled={lines === 0}
              onClick={() => {
                const text = d.logs.map((l) => `${l.ts} ${l.phase} ${l.line}`).join('\n');
                void navigator.clipboard?.writeText(text).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[#d6d5e4] transition-colors hover:bg-white/[0.08] disabled:opacity-40"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </div>
        {d.logs.map((l, i) => {
          const bad = l.phase === 'fail' || / 503 |no healthy/.test(l.line);
          const warn = !bad && /\bwarn(ing)?\b/i.test(l.line);
          const good = l.phase === 'live' || / 200 /.test(l.line);
          return (
            <div key={i} className="log-in grid grid-cols-[76px_64px_1fr] gap-4">
              <span className="text-[#5d5c74]">{l.ts}</span>
              <span className={l.phase === 'fail' ? 'text-[#ff7480]' : l.phase === 'live' ? 'text-[#4fd08f]' : 'text-[#8b80ff]'}>
                {l.phase}
              </span>
              <span className={cx(bad ? 'text-[#ff7480]' : warn ? 'text-[#f5b84a]' : good ? 'text-[#4fd08f]' : undefined)}>{l.line}</span>
            </div>
          );
        })}
        {d.logs.length === 0 && !running && <p className="text-[#5d5c74]">No log lines were recorded for this deployment.</p>}
        {running && <span className="inline-block h-3.5 w-[7px] animate-pulse bg-[#8b80ff] align-[-2px]" />}
      </div>
    </div>
  );
}
