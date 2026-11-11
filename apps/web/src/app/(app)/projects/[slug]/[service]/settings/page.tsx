import { previewHost } from '@gust/contracts';
import { registryStatus } from '@gust/db/registry';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { BranchesPanel } from '@/components/BranchesPanel';
import { DeleteProject } from '@/components/DeleteProject';
import { ProjectIconPanel } from '@/components/ProjectIconPanel';
import { RegistryAccount } from '@/components/RegistryAccount';
import { Panel } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { getProject } from '@/lib/data';
import { accountView } from '@/lib/registry-action';

// Values that are literal code are set in monospace; the rest reads as prose.
const codeKeys = new Set(['Image', 'Health path', 'Network', 'Volume', 'Repository']);

export default async function ServiceSettingsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = await params;
  const project = await getProject(slug);
  const s = project?.services.find((x) => x.name === service);
  if (!project || !s) notFound();

  // The registry's public name, as images are tagged; unset in local development.
  const registry = process.env.REGISTRY_DOMAIN;
  const rows: [string, string][] = [
    ['Repository', project.repo],
    ['Image', s.type === 'stateful' || !registry ? s.image : `${registry}/${s.image}`],
    ['Type', s.type === 'app' ? 'app · blue/green without downtime' : 'stateful · one instance, restart on update'],
    ...(s.port ? ([['Port', String(s.port)]] as [string, string][]) : []),
    ...(s.healthPath ? ([['Health path', s.healthPath]] as [string, string][]) : []),
    ['Limits', `${s.cpu} CPU · ${s.memoryMb} MB`],
    ...(s.type === 'app' ? ([['Network', 'gust_edge']] as [string, string][]) : []),
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

  const user = await currentUser(await headers());
  const reg = await registryStatus(slug);
  const registryStatusView = accountView(reg);

  return (
    <div className="space-y-6">
      <ProjectIconPanel slug={slug} icon={project.icon} domain={project.domain} />

      {project.engine && (
        <BranchesPanel
          slug={slug}
          productionBranch={project.productionBranch ?? 'main'}
          previewBranches={previewBranches}
          previewUrls={previewUrls}
          productionDomains={s.domains ?? []}
          previewsStopped={project.previewsStopped ?? false}
        />
      )}
      {project.engine && (
        <div className="max-w-3xl">
          <RegistryAccount slug={slug} status={registryStatusView ?? null} canManage={user?.role === 'admin'} />
        </div>
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
      <DeleteProject slug={slug} services={project.services.map((x) => x.name)} />
    </div>
  );
}
