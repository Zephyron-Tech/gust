import { observed, projects } from '@gust/contracts/sample';
import { Plus } from '@phosphor-icons/react/ssr';
import Link from 'next/link';

import { btn, cx, Dot, PageHead, Panel } from '@/components/ui';
import { ago } from '@/lib/format';

export const metadata = { title: 'Projects' };

export default function ProjectsPage() {
  const services = projects.reduce((n, p) => n + p.services.length, 0);
  return (
    <div className="view-in space-y-6">
      <PageHead
        title="Projects"
        sub={`${projects.length} projects · ${services} services · ${observed.length} observed stacks`}
        actions={
          <button type="button" className={btn.primary}>
            <Plus size={15} weight="bold" /> New project
          </button>
        }
      />

      <Panel className="grid grid-cols-4 divide-x divide-line">
        {[
          ['Deploys today', '7'],
          ['Median deploy', '41 s'],
          ['Failed this week', '1'],
          ['Images kept', '4.8 GB'],
        ].map(([k, v]) => (
          <div key={k} className="space-y-1 px-5 py-4">
            <p className="text-[12.5px] text-fg-3">{k}</p>
            <p className="font-display text-[22px] font-semibold tracking-tight tabular-nums">{v}</p>
          </div>
        ))}
      </Panel>

      <div className="grid grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link
            key={p.slug}
            href={`/projects/${p.slug}/${p.services.find((s) => s.type === 'app')?.name ?? p.services[0]?.name}/deployments`}
            className="group flex flex-col gap-3 rounded-xl border border-line bg-bg-2 p-[18px] transition-colors duration-150 hover:border-fg-3"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-display text-[16px] font-semibold tracking-tight">{p.slug}</span>
              <Dot health={p.health} />
            </span>
            <span className="truncate font-mono text-[12.5px] text-fg-3">{p.domain}</span>
            <span className="flex flex-wrap gap-1.5">
              {p.services.map((s) => (
                <span
                  key={s.name}
                  className={cx(
                    'rounded-md bg-bg-3 px-1.5 py-1 font-mono text-[11.5px] leading-none',
                    s.type === 'stateful' ? 'text-info' : 'text-fg-2',
                  )}
                >
                  {s.name}
                </span>
              ))}
            </span>
            <span className="text-[12.5px] text-fg-3">
              {p.health === 'stopped' ? 'Stopped' : `Last deploy ${ago(p.lastDeploy)}`} · {p.repo}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
