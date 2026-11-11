'use client';

import { useCallback, useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { size } from '@/lib/format';
import { announceServerChange } from '@/lib/useServerMetrics';
import { RefreshButton, withMinimumSpin } from './RefreshButton';
import { btn, PageHead, Panel } from './ui';

type Usage = { unusedImages: number; unusedImageMb: number; stoppedGustContainers: number };

// The host samples disk once a minute, so the freed space shows after the next sample.
const SAMPLE_POLL_MS = 5_000;
const SAMPLE_POLL_TRIES = 16;

/** When the host last sampled, from the metrics the Server page reads. */
async function sampledAt(): Promise<string | null> {
  const res = await fetch('/api/server/metrics?range=1h', { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  const view = (await res.json()) as { snapshot: { at: string } | null };
  return view.snapshot?.at ?? null;
}

/**
 * Removes what the host no longer uses: images no container runs, and stopped
 * containers Gust made. Volumes and the build cache are left alone. Admins act;
 * everyone sees what is there.
 */
export function DockerCleanup() {
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set after a cleanup until the host has sampled disk again.
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/system/cleanup', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return setError('The engine did not answer.');
    setError(null);
    setUsage((await res.json()) as Usage);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Reloads this panel and the server numbers everywhere else on screen. */
  async function refresh() {
    setRefreshing(true);
    announceServerChange();
    await withMinimumSpin(load());
    setRefreshing(false);
  }

  /** Waits for the host's next disk sample, then refreshes the numbers that show it. */
  async function waitForSample(before: string | null) {
    setSettling(true);
    for (let i = 0; i < SAMPLE_POLL_TRIES; i++) {
      await new Promise((r) => setTimeout(r, SAMPLE_POLL_MS));
      const at = await sampledAt();
      if (at && at !== before) break;
    }
    setSettling(false);
    announceServerChange();
  }

  const nothing = usage && usage.unusedImages === 0 && usage.stoppedGustContainers === 0;

  async function run() {
    if (!armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    const before = await sampledAt();
    const res = await fetch('/api/system/cleanup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ images: true, containers: true }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as {
      imagesDeleted?: number;
      containersDeleted?: number;
      spaceReclaimedMb?: number;
      error?: string;
    } | null;
    if (!res?.ok) return notify('Nothing removed', body?.error ?? 'Try again.', 'err');
    notify(
      'Cleaned up',
      `${body?.imagesDeleted ?? 0} images and ${body?.containersDeleted ?? 0} containers removed, ${size(body?.spaceReclaimedMb ?? 0)} freed.`,
      'ok',
    );
    void load();
    announceServerChange();
    void waitForSample(before);
  }

  return (
    <div className="space-y-4">
      <PageHead title="Docker cleanup" sub="Unused images and stopped Gust containers on this host. Volumes and build cache stay." />
      <Panel className="flex flex-wrap items-center justify-between gap-5 px-6 py-5">
        <div className="space-y-1.5 text-[14.5px]">
          {error ? (
            <p className="text-err">{error}</p>
          ) : usage ? (
            <>
              <p className="text-fg">
                <span className="tabular-nums">{usage.unusedImages}</span> unused images, about{' '}
                <span className="tabular-nums">{size(usage.unusedImageMb)}</span>
              </p>
              <p className="text-fg-3">
                <span className="tabular-nums">{usage.stoppedGustContainers}</span> stopped Gust containers
              </p>
            </>
          ) : (
            <p className="text-fg-3">Reading the host…</p>
          )}
          {settling && <p className="text-[13px] text-fg-3">Freed space shows after the host’s next sample, within a minute.</p>}
        </div>
        {admin ? (
          <div className="flex items-center gap-2">
            <RefreshButton onClick={() => void refresh()} loading={refreshing} disabled={busy} />
            <button type="button" className={btn.primary} disabled={busy || !usage || !!nothing} onClick={() => void run()}>
              {busy ? 'Cleaning…' : armed ? 'Really clean up?' : 'Clean up'}
            </button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
