import { ArrowRight } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { Ago } from '@/components/Ago';
import { StorageCreate, type StorageTarget } from '@/components/StorageCreate';
import { btn, cx, PageHead, Panel, Tag } from '@/components/ui';
import { getProjects } from '@/lib/data';
import { listAllDatabases, type StorageRow } from '@/lib/databases-db';

export const metadata = { title: 'Storage' };

export const dynamic = 'force-dynamic';

const STATE: Record<StorageRow['state'], { label: string; ink: string }> = {
  provisioning: { label: 'Creating', ink: 'text-warn' },
  ready: { label: 'Ready', ink: 'text-ok' },
  failed: { label: 'Failed', ink: 'text-err' },
  deleting: { label: 'Deleting', ink: 'text-warn' },
};

export default async function StoragePage() {
  const [rows, projects] = await Promise.all([listAllDatabases(), getProjects()]);
  // A database lives on one service's Databases page: the project's app service, as on the projects list.
  const home = new Map(projects.map((p) => [p.slug, p.services.find((s) => s.type === 'app')?.name ?? p.services[0]?.name]));
  const ready = rows.filter((r) => r.state === 'ready').length;
  const targets: StorageTarget[] = projects.flatMap((p) => {
    const service = home.get(p.slug);
    return service ? [{ slug: p.slug, service }] : [];
  });

  return (
    <div className="view-in space-y-8">
      <PageHead title="Storage" sub={`${rows.length} databases · ${ready} ready`} />

      <StorageCreate targets={targets} />

      {rows.length === 0 ? (
        <Panel className="px-6 py-10 text-center">
          <p className="font-medium">No databases yet.</p>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-fg-3">
            Create one on a service&apos;s Databases page. Gust gives it its own role and writes the connection string into the
            service&apos;s environment.
          </p>
          <Link href="/projects" className={cx(btn.secondary, 'mt-6 inline-flex')}>
            Go to projects
          </Link>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          {rows.map((r, i) => {
            const href = `/storage/${r.slug}/${r.name}`;
            const word = STATE[r.state];
            return (
              <Link
                key={r.database}
                href={href}
                className={cx(
                  'group flex items-center gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-bg-3/40',
                  i > 0 && 'border-t border-line',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    <Tag>{r.slug}</Tag>
                  </span>
                  <span className="block truncate font-mono text-[12.5px] text-fg-3">{r.database}</span>
                  {r.state === 'failed' && r.error && <span className="block truncate text-[13px] text-err">{r.error}</span>}
                </span>
                <span className="hidden w-[190px] shrink-0 truncate text-right text-[13px] text-fg-3 md:block">
                  {r.lastBackup ? (
                    <>
                      Backed up <Ago iso={r.lastBackup.toISOString()} />
                    </>
                  ) : (
                    'No backup yet'
                  )}
                </span>
                <span className={cx('w-[90px] shrink-0 text-right text-[13px] font-medium', word.ink)}>{word.label}</span>
                <ArrowRight size={15} className="shrink-0 text-fg-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
