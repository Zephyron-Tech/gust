'use client';

import { useEffect, useState } from 'react';

import { btn, cx, Panel } from '@/components/ui';
import { useUpdateStatus } from '@/lib/useUpdateStatus';

type Kind = 'check' | 'install';

// The request we sent and are waiting on. It ends when the host writes a new
// result (checkedAt changes) and is no longer running.
type Job = { kind: Kind; sentAt: number; baseline: string | null };

// How long to wait for the host before saying so. A check takes seconds; an
// install pulls and restarts, so it gets much longer.
const TIMEOUT_MS: Record<Kind, number> = { check: 120_000, install: 20 * 60_000 };

const short = (digest: string) => digest.replace(/^sha256:/, '').slice(0, 12);

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

/** The Gust section of Settings: versions, a manual check and a confirmed install. */
export function UpdatePanel({ rows }: { rows: [string, string][] }) {
  const { status, error, reload } = useUpdateStatus();
  const [sending, setSending] = useState<Kind | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const running = status?.state === 'running';
  const jobActive = job !== null;

  // Polls while a request is open or the host is busy, and ticks the elapsed time.
  useEffect(() => {
    if (!jobActive && !running) return;
    const poll = window.setInterval(() => void reload(), 2000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [jobActive, running, reload]);

  const finished = job !== null && status !== null && !running && status.checkedAt !== job.baseline;
  const elapsed = job ? now - job.sentAt : 0;
  const timedOut = job !== null && !finished && elapsed > TIMEOUT_MS[job.kind];
  const inFlight = job !== null && !finished && !timedOut;

  // A finished check clears itself after a few seconds; errors stay until dismissed.
  const checkDone = job?.kind === 'check' && finished && status?.state !== 'failed';
  useEffect(() => {
    if (!checkDone) return;
    const id = window.setTimeout(() => setJob(null), 6000);
    return () => window.clearTimeout(id);
  }, [checkDone]);

  // A finished install means the new version is running: reload so the page
  // picks up the new build, as a manual F5 would.
  const installDone = job?.kind === 'install' && finished && status?.state === 'ok';
  useEffect(() => {
    if (installDone) window.location.reload();
  }, [installDone]);

  const available = status?.available === true;
  const canManage = status?.canManage === true;
  const busy = sending !== null || inFlight || running;

  async function send(kind: Kind) {
    setSending(kind);
    setSendError(null);
    const res = await fetch(kind === 'check' ? '/api/system/update/check' : '/api/system/update', {
      method: 'POST',
    }).catch(() => null);
    setSending(null);
    setConfirming(false);
    if (!res?.ok) {
      const body = res ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
      setSendError(body?.error ?? 'Could not reach Gust. Nothing was sent. Try again.');
      return;
    }
    const at = Date.now();
    setNow(at);
    setJob({ kind, sentAt: at, baseline: status?.checkedAt ?? null });
    await reload();
  }

  // The message under the buttons: progress while waiting, the outcome when done.
  let message: { tone: 'busy' | 'ok' | 'err'; text: string } | null = null;
  if (sendError) {
    message = { tone: 'err', text: sendError };
  } else if (job && timedOut) {
    message = {
      tone: 'err',
      text: `No answer from the host after ${Math.round(elapsed / 60_000)} min. On the server run: journalctl -u gust-requests.service -n 50`,
    };
  } else if (job && inFlight) {
    const secs = Math.round(elapsed / 1000);
    if (running && job.kind === 'check') {
      message = { tone: 'busy', text: `Checking the registry… ${secs} s` };
    } else if (running) {
      message = {
        tone: 'busy',
        text: `Installing: backing up the database, pulling the image and restarting. ${secs} s (usually a few minutes)`,
      };
    } else {
      message = { tone: 'busy', text: `Request sent. Waiting for the host to pick it up… ${secs} s` };
    }
  } else if (job && finished && status) {
    if (status.state === 'failed') {
      message = { tone: 'err', text: status.error ?? (job.kind === 'install' ? 'Update failed. See the log below.' : 'Check failed.') };
    } else if (job.kind === 'check') {
      message = {
        tone: 'ok',
        text: status.available ? `Newer version available: ${short(status.latest)}.` : 'Checked. You are on the latest version.',
      };
    } else {
      message = { tone: 'ok', text: 'Update finished. Gust is on the latest version.' };
    }
  }

  const summary = !status
    ? (error ?? 'Loading…')
    : status.state === 'running'
      ? status.action === 'check'
        ? 'Checking the registry.'
        : 'Updating. Gust restarts in a few minutes.'
      : status.state === 'failed'
        ? status.action === 'check'
          ? (status.error ?? 'The last check failed.')
          : 'The last update failed. The log below shows why; the backup taken before it is in the backups folder.'
        : status.state === 'ok'
          ? 'The last update finished.'
          : available
            ? 'A newer version is available.'
            : status.state === 'unknown'
              ? 'Not checked yet. The server checks every 10 minutes.'
              : 'Up to date.';

  return (
    <Panel className="min-w-0 p-6">
      <h2 className="mb-4 font-display text-[17px]">Gust</h2>
      <dl className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-8 gap-y-3 text-[14.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-3">{k}</dt>
            <dd className="text-fg-2">{v}</dd>
          </div>
        ))}
        <dt className="text-fg-3">Installed</dt>
        <dd className="font-mono text-[13.5px] text-fg-2">{status?.current ? short(status.current) : '—'}</dd>
        <dt className="text-fg-3">Latest</dt>
        <dd className="font-mono text-[13.5px] text-fg-2">
          {status?.latest ? (available ? short(status.latest) : `${short(status.latest)} (same)`) : '—'}
        </dd>
        <dt className="text-fg-3">Last check</dt>
        <dd className="text-fg-2">{when(status?.checkedAt ?? null)}</dd>
        <dt className="text-fg-3">Status</dt>
        <dd className="text-fg-2">{summary}</dd>
      </dl>

      {canManage ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={cx(btn.secondary, 'w-48')} disabled={busy} onClick={() => void send('check')}>
            {sending === 'check' ? 'Sending…' : 'Check for update'}
          </button>
          <button type="button" className={cx(btn.primary, 'w-48')} disabled={!available || busy} onClick={() => setConfirming(true)}>
            Install update
          </button>
        </div>
      ) : (
        <p className="mt-5 text-[14px] text-fg-3">Only admins can check for or install updates.</p>
      )}

      {confirming && (
        <div className="mt-4 rounded-xl border border-line bg-bg-2 p-4 text-[14px] text-fg-2">
          Install the newer Gust image now? Gust backs up the database first. The UI can be unavailable for a short while during the
          restart.
          <div className="mt-3 flex gap-2">
            <button type="button" className={btn.primary} disabled={sending !== null} onClick={() => void send('install')}>
              {sending === 'install' ? 'Sending…' : 'Install update'}
            </button>
            <button type="button" className={btn.ghost} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <div
          role="status"
          aria-live="polite"
          className={
            message.tone === 'err'
              ? 'mt-4 flex items-start justify-between gap-3 rounded-xl border border-err/30 bg-err/10 p-3 text-[14px] text-err'
              : message.tone === 'ok'
                ? 'mt-4 flex items-start justify-between gap-3 rounded-xl border border-line bg-bg-2 p-3 text-[14px] text-fg-2'
                : 'mt-4 flex items-center gap-3 rounded-xl border border-line bg-bg-2 p-3 text-[14px] text-fg-2'
          }
        >
          <span className="flex items-center gap-3">
            {message.tone === 'busy' && <span aria-hidden className="pulse-dot inline-block size-2 shrink-0 rounded-full bg-accent" />}
            {message.text}
          </span>
          {!inFlight && (
            <button
              type="button"
              className="shrink-0 text-[13px] text-fg-3 underline-offset-2 hover:text-fg hover:underline"
              onClick={() => {
                setJob(null);
                setSendError(null);
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {canManage && status?.log !== undefined && (
        <details className="mt-5 min-w-0 text-[14px]">
          <summary className="cursor-pointer text-fg-3 hover:text-fg-2">Update log</summary>
          <pre className="mt-3 max-h-72 w-full max-w-full overflow-auto rounded-lg bg-bg p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-fg-2">
            {status.log || 'No output yet.'}
          </pre>
        </details>
      )}
    </Panel>
  );
}
