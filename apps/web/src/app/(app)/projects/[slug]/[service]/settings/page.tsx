import { previewHost } from '@gust/contracts';
import { notFound } from 'next/navigation';

import { BranchesPanel } from '@/components/BranchesPanel';
import { Panel } from '@/components/ui';
import { getProject } from '@/lib/data';

// Values that are literal code are set in monospace; the rest reads as prose.
const codeKeys = new Set(['Image', 'Health path', 'Networks', 'Volume', 'Repository']);

export default async function ServiceSettingsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = await params;
  const project = await getProject(slug);
  const s = project?.services.find((x) => x.name === service);
  if (!project || !s) notFound();

  const rows: [string, string][] = [
    ['Repository', project.repo],
    ['Image', s.type === 'stateful' ? s.image : `registry.gust.zephyron.tech/${s.image}`],
    ['Type', s.type === 'app' ? 'app · blue/green without downtime' : 'stateful · one instance, restart on update'],
    ...(s.port ? ([['Port', String(s.port)]] as [string, string][]) : []),
    ...(s.healthPath ? ([['Health path', s.healthPath]] as [string, string][]) : []),
    ['Limits', `${s.cpu} CPU · ${s.memoryMb} MB`],
    ['Keep images', '5'],
    ['Networks', s.type === 'app' ? `gust_edge, gust_proj_${slug}` : `gust_proj_${slug}`],
    ...(s.type === 'stateful'
      ? ([
          ['Volume', `gust_${slug}_${s.name}_data`],
          ['Backup', 'nightly at 03:00 and before every update'],
        ] as [string, string][])
      : []),
  ];

  // Branches belong to the project, so the panel is shown on every engine service of it.
  const domain = process.env.GUST_DOMAIN;
  const previewBranches = project.previewBranches ?? [];
  const previewUrls = Object.fromEntries(previewBranches.flatMap((b) => (domain ? [[b, `https://${previewHost(b, slug, domain)}`]] : [])));

  return (
    <div className="space-y-6">
      {project.engine && (
        <BranchesPanel
          slug={slug}
          productionBranch={project.productionBranch ?? 'main'}
          previewBranches={previewBranches}
          previewUrls={previewUrls}
          productionDomains={s.domains ?? []}
        />
      )}
      <Panel className="view-in max-w-3xl p-7">
        <dl className="grid grid-cols-[180px_1fr] gap-x-8 gap-y-4 text-[14.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-3">{k}</dt>
              <dd className={codeKeys.has(k) ? 'font-mono text-[13px] text-fg-2' : 'text-fg-2'}>{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
