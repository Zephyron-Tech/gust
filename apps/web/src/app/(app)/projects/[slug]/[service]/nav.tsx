'use client';

import { Rocket } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { btn, cx } from '@/components/ui';
import { useDemo } from '@/lib/demo';

const TABS = ['deployments', 'domains', 'environment', 'logs', 'settings'] as const;

export function ServiceTabs({ base, stateful }: { base: string; stateful: boolean }) {
  const path = usePathname();
  const tabs = stateful ? (['environment', 'logs', 'settings'] as const) : TABS;
  return (
    <nav aria-label="Service" className="flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const href = `${base}/${t}`;
        const on = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={t}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={cx(
              '-mb-px border-b-2 px-3 py-2.5 text-[14px] capitalize transition-colors duration-150',
              on ? 'border-accent text-fg' : 'border-transparent text-fg-2 hover:text-fg',
            )}
          >
            {t}
          </Link>
        );
      })}
    </nav>
  );
}

export function ProjectActions({ project, service, stateful }: { project: string; service: string; stateful: boolean }) {
  const { deploy, busy, notify } = useDemo();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link href={`/projects/${project}/${service}/logs`} className={btn.secondary}>
        View logs
      </Link>
      {stateful ? (
        <button
          type="button"
          className={btn.secondary}
          onClick={() => notify(`${project}/${service} restarted`, 'Backup taken first, volume kept.')}
        >
          Restart
        </button>
      ) : (
        <button type="button" className={btn.primary} disabled={busy(project, service)} onClick={() => deploy(project, service)}>
          <Rocket size={15} /> Redeploy
        </button>
      )}
    </div>
  );
}
