import { observed, projects } from '@gust/contracts/sample';
import { Plus } from '@phosphor-icons/react/ssr';
import Link from 'next/link';

import { btn, Dot, PageHead, Panel, Tag } from '@/components/ui';
import { ago } from '@/lib/format';

export const metadata = { title: 'Projects' };

export default function ProjectsPage() {
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

      <Panel className="grid grid-cols-4 divide-x divide-line">
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
        {projects.map((p) => (
          <Link
            key={p.slug}
            href={`/projects/${p.slug}/${p.services.find((s) => s.type === 'app')?.name ?? p.services[0]?.name}/deployments`}
            className="group flex flex-col gap-4 rounded-2xl border border-line bg-bg-2 p-5 transition-[border-color,transform] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-fg-3"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-display text-[18px] font-semibold tracking-tight">{p.slug}</span>
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
              <span className="truncate">{p.repo.split('/')[1]}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
