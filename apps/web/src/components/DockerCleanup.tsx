'use client';

import { ArrowsClockwise } from '@phosphor-icons/react/ssr';
import { useCallback, useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { size } from '@/lib/format';
import { btn, PageHead, Panel } from './ui';

type Usage = { unusedImages: number; unusedImageMb: number; stoppedGustContainers: number };

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
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/system/cleanup', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return setError('The engine did not answer.');
    setError(null);
    setUsage((await res.json()) as Usage);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nothing = usage && usage.unusedImages === 0 && usage.stoppedGustContainers === 0;

  async function run() {
    if (!armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
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
        </div>
        {admin ? (
          <div className="flex items-center gap-2">
            <button type="button" className={btn.secondary} onClick={() => void load()} disabled={busy}>
              <ArrowsClockwise size={16} weight="bold" />
              Refresh
            </button>
            <button type="button" className={btn.primary} disabled={busy || !usage || !!nothing} onClick={() => void run()}>
              {busy ? 'Cleaning…' : armed ? 'Really clean up?' : 'Clean up'}
            </button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
