import type { Icon } from '@phosphor-icons/react';
import { DownloadSimple, GitBranch, Plus, RocketLaunch } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { ProjectsCollection } from '@/components/ProjectsCollection';
import { ProjectsToolbar, type StateFilter } from '@/components/ProjectsToolbar';
import { btn, PageHead, Panel } from '@/components/ui';
import { getProjects } from '@/lib/data';
import { NOT_SET } from '@/lib/integrations';
import { projectStats } from '@/lib/projects-stats';

export const metadata = { title: 'Projects' };

export const dynamic = 'force-dynamic';

const FIRST_STEPS: [Icon, string, string][] = [
  [DownloadSimple, 'Import a repository', 'Pick one from the organisation. Gust reads its branches and Dockerfile.'],
  [GitBranch, 'Add the workflow', 'Gust prepares the GitHub Actions file. Commit it once, from a link.'],
  [RocketLaunch, 'Push', 'Pushes to the production branch deploy; other branches get their own preview.'],
];

// Live first, then stopped, then failed: the order the states come in on the list.
const STATE_RANK = { live: 0, stopped: 1, failed: 2 } as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ sort?: string; view?: string; state?: string }> }) {
  const [all, stats, { sort, view: viewParam, state: stateParam }] = await Promise.all([getProjects(), projectStats(), searchParams]);
  const mode = sort === 'name' ? 'name' : sort === 'status' ? 'status' : 'activity';
  const view = viewParam === 'list' ? 'list' : 'grid';
  const state: StateFilter = stateParam === 'live' || stateParam === 'stopped' || stateParam === 'failed' ? stateParam : 'all';
  const counts: Record<StateFilter, number> = {
    all: all.length,
    live: all.filter((p) => p.health === 'live').length,
    stopped: all.filter((p) => p.health === 'stopped').length,
    failed: all.filter((p) => p.health === 'failed').length,
  };
  // Ties keep the most recent deploy first. Name sorts alphabetically.
  const byActivity = (a: (typeof all)[number], b: (typeof all)[number]) => Date.parse(b.lastDeploy) - Date.parse(a.lastDeploy);
  const projects = all
    .filter((p) => state === 'all' || p.health === state)
    .sort((a, b) => {
      if (mode === 'name') return a.slug.localeCompare(b.slug);
      if (mode === 'status') return STATE_RANK[a.health] - STATE_RANK[b.health] || byActivity(a, b);
      return byActivity(a, b);
    });
  const services = all.reduce((n, p) => n + p.services.length, 0);
  const median = stats.medianDeploySec === null ? NOT_SET : `${Math.round(stats.medianDeploySec)} s`;
  return (
    <div className="view-in space-y-8">
      <PageHead
        title="Projects"
        sub={`${all.length} projects · ${services} services`}
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
          ['Deploys, 24 h', String(stats.deploys24h), `across ${all.length} projects`],
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

      {all.length === 0 && (
        <Panel className="rise-in px-6 py-10 sm:px-10" style={{ animationDelay: '120ms' }}>
          <div className="mx-auto max-w-3xl space-y-8 text-center">
            <div className="space-y-2">
              <h2 className="font-display text-[22px] font-semibold tracking-tight">Ship your first project</h2>
              <p className="mx-auto max-w-md text-[14.5px] text-fg-3">Three steps, and the next push to main goes live.</p>
            </div>
            <ol className="grid gap-4 text-left md:grid-cols-3">
              {FIRST_STEPS.map(([I, title, text], i) => (
                <li key={title} className="relative rounded-xl border border-line bg-bg p-5">
                  <span className="mb-4 flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-[10px] border border-line bg-bg-3 text-fg-2">
                      <I size={18} aria-hidden />
                    </span>
                    <span className="font-mono text-[12px] text-fg-3">0{i + 1}</span>
                  </span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-1 block text-[13.5px] leading-relaxed text-fg-3">{text}</span>
                </li>
              ))}
            </ol>
            <Link href="/projects/new" className={btn.primary}>
              <Plus weight="bold" /> Import a repository
            </Link>
          </div>
        </Panel>
      )}

      <ProjectsToolbar sort={mode} view={view} state={state} counts={counts} />

      <ProjectsCollection
        view={view}
        filterKey={state}
        items={projects.map((p) => ({
          slug: p.slug,
          href: `/projects/${p.slug}/${p.services.find((s) => s.type === 'app')?.name ?? p.services[0]?.name}/deployments`,
          icon: p.icon,
          engine: p.engine ?? false,
          domain: p.domain,
          repo: p.repo,
          health: p.health,
          lastDeploy: p.lastDeploy,
          services: p.services.map((x) => ({ name: x.name, type: x.type })),
        }))}
      />
    </div>
  );
}
