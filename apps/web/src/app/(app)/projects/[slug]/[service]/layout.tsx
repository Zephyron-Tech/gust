import { projects } from '@gust/contracts/sample';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { cx, Dot } from '@/components/ui';
import { ProjectActions, ServiceTabs } from './nav';

export default async function ServiceLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string; service: string }>;
  children: ReactNode;
}) {
  const { slug, service } = await params;
  const project = projects.find((p) => p.slug === slug);
  const svc = project?.services.find((s) => s.name === service);
  if (!project || !svc) notFound();

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[14px] text-fg-3">
        <Link href="/projects" className="hover:text-fg">
          Projects
        </Link>
        <span>/</span>
        <span className="text-fg">{project.slug}</span>
      </nav>
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-[30px] leading-[1.1]">{project.slug}</h1>
          <p className="text-[14.5px] text-fg-3">
            {project.repo} · production · {project.domain}
          </p>
        </div>
        <ProjectActions project={project.slug} service={svc.name} stateful={svc.type === 'stateful'} />
      </div>
      <div className="flex gap-2.5">
        {project.services.map((s) => (
          <Link
            key={s.name}
            href={`/projects/${project.slug}/${s.name}/${s.type === 'stateful' ? 'settings' : 'deployments'}`}
            className={cx(
              'flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2 text-[14px] font-medium transition-colors duration-150',
              s.name === svc.name ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:border-fg-3',
            )}
          >
            <Dot health={s.health} />
            {s.name}
            <span className="font-normal text-fg-3">{s.type}</span>
          </Link>
        ))}
      </div>
      <ServiceTabs base={`/projects/${project.slug}/${svc.name}`} stateful={svc.type === 'stateful'} />
      {children}
    </div>
  );
}
