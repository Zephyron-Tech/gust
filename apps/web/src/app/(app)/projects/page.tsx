import { ArrowRight, Plus } from '@phosphor-icons/react/ssr';
import Link from 'next/link';

import { ProjectIcon } from '@/components/ProjectIcon';
import { btn, Dot, PageHead, Panel, Tag } from '@/components/ui';
import { getProjects } from '@/lib/data';
import { ago } from '@/lib/format';
import { NOT_SET } from '@/lib/integrations';
import { projectStats } from '@/lib/projects-stats';

export const metadata = { title: 'Projects' };

export const dynamic = 'force-dynamic';

const SORTS = [
  { key: 'activity', label: 'Recent activity' },
  { key: 'name', label: 'Name, A–Z' },
] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const [all, stats, { sort }] = await Promise.all([getProjects(), projectStats(), searchParams]);
  const mode = sort === 'name' ? 'name' : 'activity';
  // Most recent deploy first, or alphabetical. Ties keep the server's order.
  const projects = [...all].sort((a, b) =>
    mode === 'name' ? a.slug.localeCompare(b.slug) : Date.parse(b.lastDeploy) - Date.parse(a.lastDeploy),
  );
  const services = projects.reduce((n, p) => n + p.services.length, 0);
  const median = stats.medianDeploySec === null ? NOT_SET : `${Math.round(stats.medianDeploySec)} s`;
  return (
    <div className="view-in space-y-8">
      <PageHead
        title="Projects"
        sub={`${projects.length} projects · ${services} services`}
        actions={
          <Link href="/projects/new" className={btn.primary}>
            <Plus weight="bold" /> New project
          </Link>
        }
      />

      <Panel
        className="rise-in grid grid-cols-2 divide-line max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r lg:grid-cols-4 lg:divide-x"
        style={{ animationDelay: '60ms' }}
      >
        {[
          ['Deploys, 24 h', String(stats.deploys24h), `across ${projects.length} projects`],
          ['Median deploy', median, 'push to live, last 7 days'],
          ['Failed, 7 days', String(stats.failed7d), stats.lastFailed ?? 'none'],
          ['Live services', `${stats.liveServices} of ${stats.services}`, 'newest deploy is live'],
        ].map(([k, v, note]) => (
          <div key={k} className="space-y-1 px-6 py-5">
            <p className="text-[13.5px] text-fg-3">{k}</p>
            <p className="font-display text-[28px] leading-tight font-semibold tracking-tight tabular-nums">{v}</p>
            <p className="text-[13px] text-fg-3">{note}</p>
          </div>
        ))}
      </Panel>

      {projects.length === 0 && (
        <Panel className="rise-in grid place-items-center gap-4 px-6 py-14 text-center" style={{ animationDelay: '120ms' }}>
          <div className="space-y-1.5">
            <h2 className="text-[20px]">No projects yet</h2>
            <p className="mx-auto max-w-sm text-[14.5px] text-fg-3">
              Import a repository, add the deploy workflow Gust prepares for it, and the next push goes live.
            </p>
          </div>
          <Link href="/projects/new" className={btn.primary}>
            <Plus weight="bold" /> Import a repository
          </Link>
        </Panel>
      )}

      <nav aria-label="Sort projects" className="-mb-4 flex items-center gap-1 text-[13.5px]">
        <span className="mr-2 text-fg-3">Sort by</span>
        {SORTS.map((o) => (
          <Link
            key={o.key}
            href={o.key === 'activity' ? '/projects' : `/projects?sort=${o.key}`}
            aria-current={mode === o.key ? 'page' : undefined}
            scroll={false}
            className={
              mode === o.key
                ? 'rounded-full bg-bg-3 px-3 py-1.5 font-medium text-fg'
                : 'rounded-full px-3 py-1.5 text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg'
            }
          >
            {o.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p, i) => (
          <Link
            key={p.slug}
            style={{ animationDelay: `${120 + i * 45}ms` }}
            href={`/projects/${p.slug}/${p.services.find((s) => s.type === 'app')?.name ?? p.services[0]?.name}/deployments`}
            className="rise-in hover-lift group flex flex-col gap-4 rounded-2xl border border-line bg-bg-2 p-5 transition-[translate,border-color,background-color,box-shadow] duration-300 ease-[var(--ease-out)] hover:-translate-y-1 hover:border-fg-3/60 hover:bg-bg-3/40 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.6)] active:translate-y-0 active:duration-100"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <ProjectIcon slug={p.slug} src={p.icon} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-[18px] leading-tight font-semibold tracking-tight">{p.slug}</span>
                    {!p.engine && <Tag>sample</Tag>}
                  </span>
                  <span className="block truncate text-[13.5px] text-fg-2">{p.domain}</span>
                </span>
              </span>
              <Dot health={p.health} />
            </span>
            <span className="flex flex-wrap gap-1.5">
              {p.services.map((s) => (
                <Tag key={s.name} tone={s.type === 'stateful' ? 'info' : undefined}>
                  {s.name}
                </Tag>
              ))}
            </span>
            <span className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3.5 text-[13px] text-fg-3">
              <span>{p.health === 'stopped' ? 'Stopped' : `Deployed ${ago(p.lastDeploy)}`}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{p.repo.split('/').slice(1).join('/')}</span>
                <ArrowRight
                  size={15}
                  className="shrink-0 -translate-x-1 text-fg-2 opacity-0 transition-[opacity,translate] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100"
                />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
