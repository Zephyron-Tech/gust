import { Code, PageHead, Table, Td } from '@/components/ui';
import { size } from '@/lib/format';
import { readRegistryKeep } from '@/lib/host-files';
import { NOT_SET } from '@/lib/integrations';
import { registryRepos } from '@/lib/registry';

export const metadata = { title: 'Registry' };

// Read at request time: the repositories come from zot, the retention from the host.
export const dynamic = 'force-dynamic';

export default async function RegistryPage() {
  const [repos, keep] = await Promise.all([registryRepos(), readRegistryKeep()]);
  const host = process.env.REGISTRY_DOMAIN ?? NOT_SET;
  const retention = keep === null ? NOT_SET : `keeps last ${Math.floor(keep / 2)} pushes (${keep} tags)`;

  return (
    <div className="view-in space-y-7">
      <PageHead title="Registry" sub={`Zot · ${host} · ${retention}`} />

      {repos === null ? (
        <p className="rounded-xl border border-err/35 bg-err/10 px-5 py-3 text-[14px] text-err">
          The registry did not answer. Check that the zot container is running: gust status.
        </p>
      ) : (
        <>
          <p className="text-[14px] text-fg-3 tabular-nums">
            {repos.length} {repos.length === 1 ? 'repository' : 'repositories'} · {repos.reduce((n, r) => n + r.tags, 0)} tags
          </p>
          <Table head={['Repository', 'Tags', 'Newest image']}>
            {repos.map((r) => (
              <tr key={r.name}>
                <Td>
                  <Code>{r.name}</Code>
                </Td>
                <Td className="tabular-nums">{r.tags}</Td>
                <Td className="tabular-nums">{r.sizeMb === null ? NOT_SET : size(r.sizeMb)}</Td>
              </tr>
            ))}
            {repos.length === 0 && (
              <tr>
                <Td colSpan={3} className="text-center text-fg-3">
                  Nothing pushed yet.
                </Td>
              </tr>
            )}
          </Table>
        </>
      )}
    </div>
  );
}
