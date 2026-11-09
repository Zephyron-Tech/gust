'use client';

import { useEffect, useState } from 'react';

import { btn, Panel } from '@/components/ui';
import { useUpdateStatus } from '@/lib/useUpdateStatus';

type Kind = 'check' | 'install';

const short = (digest: string) => digest.replace(/^sha256:/, '').slice(0, 12);

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

/** The Gust section of Settings: versions, a manual check and a confirmed install. */
export function UpdatePanel({ rows }: { rows: [string, string][] }) {
  const { status, error, reload } = useUpdateStatus();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  // After a request, follow the host for a minute even if it has not started yet.
  const [followUntil, setFollowUntil] = useState(0);

  const running = status?.state === 'running';

  useEffect(() => {
    if (!running && Date.now() > followUntil) return;
    const id = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(id);
  }, [running, followUntil, reload]);

  async function send(kind: Kind) {
    setBusy(kind);
    setNotice(null);
    const res = await fetch(kind === 'check' ? '/api/system/update/check' : '/api/system/update', {
      method: 'POST',
    }).catch(() => null);
    setBusy(null);
    setConfirming(false);
    if (!res?.ok) {
      const body = res ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
      setNotice({ tone: 'err', text: body?.error ?? 'Could not reach Gust. Try again.' });
    } else {
      setNotice({
        tone: 'ok',
        text:
          kind === 'check'
            ? 'Checking the registry. The result appears in a few seconds.'
            : 'Update requested. Gust backs up the database, then restarts. This page follows it.',
      });
      setFollowUntil(Date.now() + 60_000);
    }
    await reload();
  }

  const available = status?.available === true;
  const canManage = status?.canManage === true;
  const busyNow = busy !== null || running;

  const summary = !status
    ? (error ?? 'Loading…')
    : status.state === 'running'
      ? 'Updating. Gust restarts in a few minutes.'
      : status.state === 'failed'
        ? 'The last update failed. The log below shows why; the backup taken before it is in the backups folder.'
        : status.state === 'ok'
          ? 'The last update finished.'
          : available
            ? 'A newer version is available.'
            : status.state === 'unknown'
              ? 'Not checked yet. The server checks every 10 minutes.'
              : 'Up to date.';

  return (
    <Panel className="p-6">
      <h2 className="mb-4 font-display text-[17px]">Gust</h2>
      <dl className="grid grid-cols-[200px_1fr] gap-x-8 gap-y-3 text-[14.5px]">
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
          <button type="button" className={btn.secondary} disabled={busyNow} onClick={() => void send('check')}>
            {busy === 'check' ? 'Requesting…' : 'Check for update'}
          </button>
          <button type="button" className={btn.primary} disabled={!available || busyNow} onClick={() => setConfirming(true)}>
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
            <button type="button" className={btn.primary} disabled={busy !== null} onClick={() => void send('install')}>
              {busy === 'install' ? 'Requesting…' : 'Install update'}
            </button>
            <button type="button" className={btn.ghost} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className={notice.tone === 'err' ? 'mt-4 text-[14px] text-err' : 'mt-4 text-[14px] text-fg-2'}>
          {notice.text}
        </p>
      )}

      {canManage && status?.log !== undefined && (
        <details className="mt-5 text-[14px]">
          <summary className="cursor-pointer text-fg-3 hover:text-fg-2">Update log</summary>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-bg p-3 font-mono text-[12.5px] leading-relaxed text-fg-2">
            {status.log || 'No output yet.'}
          </pre>
        </details>
      )}
    </Panel>
  );
}
