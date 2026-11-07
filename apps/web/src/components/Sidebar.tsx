'use client';

import { server } from '@gust/contracts/sample';
import type { Icon } from '@phosphor-icons/react';
import { Cube, Eye, Gear, Pulse, SquaresFour } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useDemo } from '@/lib/demo';
import { useLive } from '@/lib/metrics';
import { GustMark } from './GustMark';
import { cx, Dot, Meter } from './ui';

const nav: { href: string; label: string; icon: Icon }[] = [
  { href: '/projects', label: 'Projects', icon: SquaresFour },
  { href: '/server', label: 'Server', icon: Pulse },
  { href: '/observed', label: 'Observed stacks', icon: Eye },
  { href: '/registry', label: 'Registry', icon: Cube },
  { href: '/settings', label: 'Settings', icon: Gear },
];

const pinned = [
  { slug: 'smart-targets', href: '/projects/smart-targets/api/deployments' },
  { slug: 'zephyron-web', href: '/projects/zephyron-web/web/deployments' },
];

export function Sidebar() {
  const path = usePathname();
  const live = useLive();
  const { diskAlert } = useDemo();
  const item = 'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors duration-150';

  return (
    <aside className="sticky top-0 flex h-svh w-[236px] shrink-0 flex-col border-r border-line bg-bg-2 px-3 pt-4 pb-3">
      <Link href="/projects" className="mb-5 flex items-center gap-2.5 px-2 font-display text-[19px] font-semibold tracking-[-0.04em]">
        <GustMark size={26} />
        gust
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {nav.map(({ href, label, icon: I }) => {
          const on = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={cx(item, on ? 'bg-accent-soft text-fg' : 'text-fg-2 hover:bg-bg-3 hover:text-fg')}
            >
              <I size={17} weight={on ? 'fill' : 'regular'} />
              {label}
              {href === '/server' && diskAlert && (
                <span className="ml-auto rounded-full bg-err px-1.5 font-mono text-[10.5px] leading-[18px] text-white">1</span>
              )}
            </Link>
          );
        })}
      </nav>
      <p className="mt-5 mb-1.5 px-2.5 text-[11.5px] text-fg-3">Pinned</p>
      <div className="flex flex-col gap-0.5">
        {pinned.map((p) => (
          <Link
            key={p.slug}
            href={p.href}
            className={cx(item, path.startsWith(`/projects/${p.slug}`) ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:bg-bg-3 hover:text-fg')}
          >
            <Dot health="live" />
            {p.slug}
          </Link>
        ))}
      </div>

      <Link href="/server" className="mt-auto grid gap-2 rounded-lg border-t border-line px-2.5 pt-3 text-[12px] text-fg-3 hover:text-fg-2">
        <span className="flex justify-between">
          <span>{server.plan.replace('Cloud ', '')}</span>
          <span className="font-mono">{server.vcpu} vCPU</span>
        </span>
        {[
          ['CPU', live.cpu, `${live.cpu.toFixed(0)} %`],
          ['RAM', (live.ramGb / server.ramGb) * 100, `${live.ramGb.toFixed(1)} / ${server.ramGb} GB`],
          ['Disk', diskAlert ? 91 : 31, diskAlert ? '91 / 100 GB' : '31 / 100 GB'],
        ].map(([k, v, t]) => (
          <span key={k as string} className="grid grid-cols-[34px_1fr_84px] items-center gap-2">
            <span>{k}</span>
            <Meter value={v as number} tone={k === 'Disk' && diskAlert ? 'err' : 'accent'} />
            <span className="text-right font-mono tabular-nums">{t}</span>
          </span>
        ))}
      </Link>
    </aside>
  );
}
