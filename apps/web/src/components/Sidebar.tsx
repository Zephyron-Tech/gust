'use client';

import { server } from '@gust/contracts/sample';
import type { Icon } from '@phosphor-icons/react';
import { Cube, Eye, Gear, Pulse, SquaresFour } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useDemo } from '@/lib/demo';
import { useLive } from '@/lib/metrics';
import { useIndicator } from '@/lib/useIndicator';
import { useUpdateStatus } from '@/lib/useUpdateStatus';
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
  const { status: update } = useUpdateStatus({ autoCheck: true });
  const updateAvailable = update?.available === true;
  // The highlight moves on click, before the next page has loaded, so it feels instant.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const current = nav.find((n) => path.startsWith(n.href))?.href ?? null;
  const active = pending && pending.from === path ? pending.href : current;
  const { ref: navRef, style } = useIndicator<HTMLElement>(active);
  const item = 'group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14.5px] transition-[background-color,color] duration-150';

  return (
    <aside className="sticky top-0 flex h-svh w-[260px] shrink-0 flex-col border-r border-line bg-bg-2 px-3.5 pt-5 pb-4">
      <Link href="/projects" className="mb-7 flex items-center gap-3 px-2.5 font-display text-[22px] font-semibold tracking-[-0.045em]">
        <GustMark size={30} />
        gust
      </Link>
      <nav ref={navRef} aria-label="Main" className="relative flex flex-col gap-0.5">
        <span aria-hidden className="absolute top-0 left-0 rounded-[10px] bg-accent-soft" style={style('fill')} />
        {nav.map(({ href, label, icon: I }) => {
          const on = active === href;
          return (
            <Link
              key={href}
              href={href}
              data-key={href}
              onClick={() => setPending({ href, from: path })}
              aria-current={on ? 'page' : undefined}
              className={cx('relative', item, on ? 'text-fg' : 'text-fg-2 hover:bg-bg-3/70 hover:text-fg')}
            >
              <I size={20} weight={on ? 'fill' : 'regular'} />
              {label}
              {href === '/server' && diskAlert && (
                <span className="pop-in ml-auto grid size-5 place-items-center rounded-full bg-err text-[11.5px] font-semibold text-white">
                  1
                </span>
              )}
              {href === '/settings' && updateAvailable && (
                <span className="pop-in ml-auto grid size-5 place-items-center rounded-full bg-accent text-[11.5px] font-semibold text-accent-ink">
                  1<span className="sr-only"> update available</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <p className="mt-7 mb-2 px-3 text-[12.5px] font-medium text-fg-3">Pinned</p>
      <div className="flex flex-col gap-0.5">
        {pinned.map((p) => (
          <Link
            key={p.slug}
            href={p.href}
            className={cx(item, path.startsWith(`/projects/${p.slug}`) ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:bg-bg-3/70 hover:text-fg')}
          >
            <Dot health="live" />
            {p.slug}
          </Link>
        ))}
      </div>

      <Link
        href="/server"
        className="mt-auto grid gap-2.5 rounded-xl bg-bg-3/60 px-3.5 py-3.5 text-[13px] text-fg-3 transition-colors hover:text-fg-2"
      >
        <span className="flex justify-between">
          <span className="font-medium text-fg-2">{server.plan.replace('Cloud ', '')}</span>
          <span>{server.vcpu} vCPU</span>
        </span>
        {[
          ['CPU', live.cpu, `${live.cpu.toFixed(0)} %`],
          ['RAM', (live.ramGb / server.ramGb) * 100, `${live.ramGb.toFixed(1)} / ${server.ramGb} GB`],
          ['Disk', diskAlert ? 91 : 31, diskAlert ? '91 / 100 GB' : '31 / 100 GB'],
        ].map(([k, v, t]) => (
          <span key={k as string} className="grid grid-cols-[38px_1fr_92px] items-center gap-2.5">
            <span>{k}</span>
            <Meter value={v as number} tone={k === 'Disk' && diskAlert ? 'err' : 'accent'} />
            <span className="text-right tabular-nums">{t}</span>
          </span>
        ))}
      </Link>
    </aside>
  );
}
