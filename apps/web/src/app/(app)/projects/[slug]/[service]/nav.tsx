'use client';

import { Rocket } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { btn, cx } from '@/components/ui';
import { useDemo } from '@/lib/demo';
import { useIndicator } from '@/lib/useIndicator';

const TABS = ['deployments', 'domains', 'environment', 'logs', 'settings'] as const;

export function ServiceTabs({ base, stateful }: { base: string; stateful: boolean }) {
  const path = usePathname();
  const tabs = stateful ? (['environment', 'logs', 'settings'] as const) : TABS;
  const [pending, setPending] = useState<{ tab: string; from: string } | null>(null);
  const current = tabs.find((t) => path === `${base}/${t}` || path.startsWith(`${base}/${t}/`)) ?? null;
  const active = pending && pending.from === path ? pending.tab : current;
  const { ref, style } = useIndicator<HTMLElement>(active);
  return (
    <nav ref={ref} aria-label="Service" className="relative flex gap-1 border-b border-line">
      <span aria-hidden className="absolute top-0 left-0 rounded-full bg-accent" style={style('underline')} />
      {tabs.map((t) => {
        const href = `${base}/${t}`;
        const on = active === t;
        return (
          <Link
            key={t}
            href={href}
            data-key={t}
            onClick={() => setPending({ tab: t, from: path })}
            aria-current={on ? 'page' : undefined}
            className={cx('px-3.5 py-3 text-[15px] capitalize transition-colors duration-200', on ? 'text-fg' : 'text-fg-2 hover:text-fg')}
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
          <Rocket /> Redeploy
        </button>
      )}
    </div>
  );
}
