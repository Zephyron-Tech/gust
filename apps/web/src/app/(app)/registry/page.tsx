import { listAccounts } from '@gust/db/registry';
import { headers } from 'next/headers';
import Link from 'next/link';

import { RegistryAccountRow } from '@/components/RegistryAccountRow';
import { Code, PageHead, Table, Td } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { size } from '@/lib/format';
import { readRegistryKeep } from '@/lib/host-files';
import { NOT_SET } from '@/lib/integrations';
import { registryRepos } from '@/lib/registry';
import { accountView } from '@/lib/registry-action';

export const metadata = { title: 'Registry' };

// Read at request time: the repositories come from zot, the retention from the host.
export const dynamic = 'force-dynamic';

export default async function RegistryPage() {
  const [repos, keep, accounts, user] = await Promise.all([
    registryRepos(),
    readRegistryKeep(),
    listAccounts(),
    currentUser(await headers()),
  ]);
  const canManage = user?.role === 'admin';
  const host = process.env.REGISTRY_DOMAIN ?? NOT_SET;
  const retention = keep === null ? NOT_SET : `keeps last ${Math.floor(keep / 2)} pushes (${keep} tags)`;

  return (
    <div className="view-in space-y-10">
      <PageHead title="Registry" sub={`Zot · ${host} · ${retention}`} />

      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-medium text-fg">Accounts</h2>
          <p className="text-[13.5px] text-fg-3">
            Each project pushes with its own account. Gust writes its GitHub secrets. Projects without an account can get one here.
          </p>
        </div>
        <Table head={['Project', 'Account', 'State', 'Password changed', 'GitHub secrets', ...(canManage ? ['Actions'] : [])]}>
          {accounts.map((a) => (
            <RegistryAccountRow
              key={a.slug}
              slug={a.slug}
              repo={a.repo}
              status={a.username ? accountView({ ...a, username: a.username }) : null}
              canManage={canManage}
            />
          ))}
          {accounts.length === 0 && (
            <tr>
              <Td colSpan={canManage ? 6 : 5} className="text-center text-fg-3">
                No projects on the engine yet.
              </Td>
            </tr>
          )}
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-medium text-fg">Repositories</h2>
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
                    <Link href={`/registry/${r.name}`} className="hover:text-accent">
                      <Code>{r.name}</Code>
                    </Link>
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
      </section>
    </div>
  );
}
