import { previewHost } from '@gust/contracts';
import { GitBranch } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Beacon } from '@/components/Beacon';
import { ProjectPower } from '@/components/PowerControls';
import { cx } from '@/components/ui';
import { getProject } from '@/lib/data';
import { EngineNotice, ProjectActions, ServiceTabs } from './nav';

export default async function ServiceLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string; service: string }>;
  children: ReactNode;
}) {
  const { slug, service } = await params;
  const project = await getProject(slug);
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
        <div className="space-y-3">
          <h1 className="text-[30px] leading-[1.1]">{project.slug}</h1>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[14.5px]">
            <dt className="text-fg-3">GitHub</dt>
            <dd>
              {project.repo ? (
                <a href={`https://github.com/${project.repo}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {project.repo}
                </a>
              ) : (
                <span className="text-fg-3">not linked</span>
              )}
            </dd>
            <dt className="text-fg-3">Production</dt>
            <dd className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <BranchHost branch={project.productionBranch ?? 'main'} host={project.domain} />
            </dd>
            <dt className="text-fg-3">Previews</dt>
            <dd className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {project.previewBranches?.length ? (
                project.previewBranches.map((b) => {
                  const host = process.env.GUST_DOMAIN ? previewHost(b, project.slug, process.env.GUST_DOMAIN) : null;
                  return <BranchHost key={b} branch={b} host={host} />;
                })
              ) : (
                <span className="text-fg-3">none</span>
              )}
            </dd>
          </dl>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* One app service: the service button already does everything, so no second Stop beside it. */}
          {project.services.filter((s) => s.type === 'app').length > 1 && (
            <ProjectPower project={project.slug} allStopped={project.services.every((s) => s.health === 'stopped')} />
          )}
          <ProjectActions
            project={project.slug}
            service={svc.name}
            stateful={svc.type === 'stateful'}
            engine={project.engine}
            image={svc.image}
            stopped={svc.health === 'stopped'}
          />
        </div>
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
            <Beacon health={s.health} showLabel />
            {s.name}
            <span className="font-normal text-fg-3">{s.type}</span>
          </Link>
        ))}
      </div>
      {project.engine && <EngineNotice />}
      <ServiceTabs base={`/projects/${project.slug}/${svc.name}`} stateful={svc.type === 'stateful'} />
      {children}
    </div>
  );
}

/** A branch with its host: a branch icon, the branch name, then the host as a link. */
function BranchHost({ branch, host }: { branch: string; host: string | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-fg-2">
        <GitBranch size={15} weight="bold" aria-hidden />
        {branch}
      </span>
      {host && (
        <a href={`https://${host}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {host}
        </a>
      )}
    </span>
  );
}
