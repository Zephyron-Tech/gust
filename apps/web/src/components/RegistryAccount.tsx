'use client';

import type { AccountView } from '@/lib/registry-action';
import { LocalTime } from './LocalTime';
import { RegistryAccountButtons } from './RegistryAccountButtons';
import { RegistryBanner } from './RegistryBanner';
import { Panel } from './ui';
import { useRegistryJob } from './useRegistryJob';

export type RegistryStatus = AccountView;

/**
 * The project's own registry account: whether it exists, when its password last changed, and whether
 * its GitHub secrets were written. Only admins may change it; everyone sees the state.
 */
export function RegistryAccount({ slug, status, canManage }: { slug: string; status: RegistryStatus; canManage: boolean }) {
  const { busy, banner, act } = useRegistryJob(slug, status);

  return (
    <Panel className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 text-[14.5px]">
          <p className="font-medium text-fg">Registry account</p>
          {!status ? (
            <p className="text-fg-3">No account yet. Create one to push images for this project.</p>
          ) : status.revokedAt ? (
            <p className="text-fg-3">
              <span className="font-mono text-[13px]">{status.username}</span> is revoked. It cannot push.
            </p>
          ) : status.secretError ? (
            <p className="text-err">The GitHub secrets were not set: {status.secretError}</p>
          ) : status.secretSetAt ? (
            <p className="text-fg-2">
              <span className="font-mono text-[13px]">{status.username}</span>, secrets set on GitHub.
            </p>
          ) : (
            <p className="text-fg-3">
              <span className="font-mono text-[13px]">{status.username}</span>, secrets pending.
            </p>
          )}
          {status?.rotatedAt && !status.revokedAt && (
            <p className="text-[13px] text-fg-3">
              Password changed <LocalTime iso={status.rotatedAt} />
            </p>
          )}
        </div>
        {canManage && <RegistryAccountButtons status={status} busy={busy} onAct={act} />}
      </div>
      {banner && <RegistryBanner banner={banner} />}
    </Panel>
  );
}
