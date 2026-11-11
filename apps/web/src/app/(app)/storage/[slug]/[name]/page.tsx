import { listTables, withProjectDb } from '@gust/db/project-db';
import { ArrowRight } from '@phosphor-icons/react/ssr';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ago } from '@/components/Ago';
import { DatabaseActions } from '@/components/DatabaseActions';
import { Code, Panel } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { getProject } from '@/lib/data';
import { envKeyFor, listProjectDatabases, lookupDatabase } from '@/lib/databases-db';

export const metadata = { title: 'Database' };
export const dynamic = 'force-dynamic';

const bytes = (n: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

export default async function StorageOverviewPage({ params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  const row = await lookupDatabase(slug, name);
  if (!row) notFound();

  const [user, project, { backups }] = await Promise.all([headers().then(currentUser), getProject(slug), listProjectDatabases(slug)]);
  const admin = user?.role === 'admin';
  const home = project?.services.find((s) => s.type === 'app')?.name ?? project?.services[0]?.name;
  const mine = backups.filter((b) => b.database === row.database);

  // Live figures come from the database itself; if it cannot be reached the rest of the page still shows.
  let live: { size: number; tables: number } | null = null;
  if (row.kind === 'postgres' && row.state === 'ready') {
    live = await withProjectDb(row, { readOnly: true }, listTables)
      .then((r) => ({ size: r.size, tables: r.tables.length }))
      .catch(() => null);
  }

  const facts: [string, React.ReactNode][] = [
    ['Type', row.kind === 'redis' ? 'Redis' : 'Postgres'],
    ['Created', <Ago key="c" iso={row.createdAt.toISOString()} />],
    ['Login', <Code key="l">{row.role}</Code>],
    ['App variable', <Code key="v">{envKeyFor(row.name, row.kind)}</Code>],
    ...(live
      ? ([
          ['Size', bytes(live.size)],
          ['Tables', String(live.tables)],
        ] as [string, React.ReactNode][])
      : []),
  ];

  return (
    <div className="space-y-6">
      {row.error && (
        <p role="alert" className="rounded-xl border border-err/30 bg-err/10 p-3 text-[14px] text-err">
          {row.error}
        </p>
      )}

      <Panel className="p-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-[14.5px]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-3">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13.5px] text-fg-3">
          Only this database&apos;s login can reach it. The connection string is set on the app; redeploy the app to pick up a change.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {admin && <DatabaseActions slug={slug} db={row} />}
          {home && (
            <Link
              href={`/projects/${slug}/${home}/databases`}
              className="inline-flex items-center gap-1.5 text-[14px] text-accent hover:underline"
            >
              Open in project <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display text-[17px]">Backups</h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-[14px] text-fg-3">No backups of this database yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {mine.map((b, i) => (
              <li key={`${b.file}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[14px]">
                <Code className="text-fg-2">{b.file || b.database}</Code>
                <span className="text-fg-3">
                  <Ago iso={new Date(b.at).toISOString()} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
