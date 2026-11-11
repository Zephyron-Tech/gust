'use client';

import type { AccountView } from '@/lib/registry-action';
import { LocalTime } from './LocalTime';
import { RegistryAccountButtons } from './RegistryAccountButtons';
import { RegistryBanner } from './RegistryBanner';
import { Code, Td } from './ui';
import { useRegistryJob } from './useRegistryJob';

/** One project's account as a row of the Registry page. The banner gets its own row under it. */
export function RegistryAccountRow({
  slug,
  repo,
  status,
  canManage,
}: {
  slug: string;
  repo: string;
  status: AccountView;
  canManage: boolean;
}) {
  const { busy, banner, act } = useRegistryJob(slug, status);
  const cols = canManage ? 6 : 5;

  return (
    <>
      <tr>
        <Td>
          <a href={`/projects/${slug}`} className="text-fg hover:text-accent">
            {slug}
          </a>
          <div className="font-mono text-[12.5px] text-fg-3">{repo}</div>
        </Td>
        <Td>{status ? <Code>{status.username}</Code> : <span className="text-fg-3">-</span>}</Td>
        <Td>
          {!status ? (
            <span className="text-fg-3">No account</span>
          ) : status.revokedAt ? (
            <span className="text-fg-3">Revoked</span>
          ) : status.secretError ? (
            <span className="text-err">Secret error</span>
          ) : (
            <span className="text-fg-2">Active</span>
          )}
        </Td>
        <Td className="text-fg-3">{status?.rotatedAt ? <LocalTime iso={status.rotatedAt} /> : '-'}</Td>
        <Td className="text-fg-3">{status?.secretSetAt && !status.secretError ? <LocalTime iso={status.secretSetAt} /> : '-'}</Td>
        {canManage && (
          <Td>
            <RegistryAccountButtons status={status} busy={busy} onAct={act} />
          </Td>
        )}
      </tr>
      {banner && (
        <tr>
          <Td colSpan={cols}>
            <RegistryBanner banner={banner} />
          </Td>
        </tr>
      )}
    </>
  );
}
