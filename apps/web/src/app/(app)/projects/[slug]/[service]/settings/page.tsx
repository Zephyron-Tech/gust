import { projects } from '@gust/contracts/sample';
import { notFound } from 'next/navigation';

import { Panel } from '@/components/ui';

export default async function ServiceSettingsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = await params;
  const project = projects.find((p) => p.slug === slug);
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

  return (
    <Panel className="view-in max-w-3xl p-6">
      <dl className="grid grid-cols-[170px_1fr] gap-x-6 gap-y-3 text-[13.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-3">{k}</dt>
            <dd className="font-mono text-[12.5px] text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
