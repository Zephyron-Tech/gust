import { observed } from '@gust/contracts/sample';
import { ArrowRight, Plus } from '@phosphor-icons/react/ssr';
import Link from 'next/link';

import { btn, Dot, PageHead, Panel, Tag } from '@/components/ui';
import { getProjects } from '@/lib/data';
import { ago } from '@/lib/format';

export const metadata = { title: 'Projects' };

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await getProjects();
  const services = projects.reduce((n, p) => n + p.services.length, 0);
  return (
    <div className="view-in space-y-8">
      <PageHead
        title="Projects"
        sub={`${projects.length} projects · ${services} services · ${observed.length} observed stacks`}
        actions={
          <button type="button" className={btn.primary}>
            <Plus weight="bold" /> New project
          </button>
        }
      />

      <Panel className="rise-in grid grid-cols-4 divide-x divide-line" style={{ animationDelay: '60ms' }}>
        {[
          ['Deploys today', '7', 'across 4 projects'],
          ['Median deploy', '41 s', 'push to live'],
          ['Failed this week', '1', 'moodtracker/api'],
          ['Images kept', '4.8 GB', 'of 100 GB disk'],
        ].map(([k, v, note]) => (
          <div key={k} className="space-y-1 px-6 py-5">
            <p className="text-[13.5px] text-fg-3">{k}</p>
            <p className="font-display text-[28px] leading-tight font-semibold tracking-tight tabular-nums">{v}</p>
            <p className="text-[13px] text-fg-3">{note}</p>
          </div>
        ))}
      </Panel>

      <div className="grid grid-cols-3 gap-4">
        {projects.map((p, i) => (
          <Link
            key={p.slug}
            style={{ animationDelay: `${120 + i * 45}ms` }}
            href={`/projects/${p.slug}/${p.services.find((s) => s.type === 'app')?.name ?? p.services[0]?.name}/deployments`}
            className="rise-in group flex flex-col gap-4 rounded-2xl border border-line bg-bg-2 p-5 transition-[translate,border-color,background-color,box-shadow] duration-300 ease-[var(--ease-out)] hover:-translate-y-1 hover:border-fg-3/60 hover:bg-bg-3/40 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.6)] active:translate-y-0 active:duration-100"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="font-display text-[18px] font-semibold tracking-tight">{p.slug}</span>
                {p.engine && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent">real deploys</span>
                )}
              </span>
              <Dot health={p.health} />
            </span>
            <span className="-mt-2 truncate text-[14px] text-fg-2">{p.domain}</span>
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
