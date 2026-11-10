'use client';

import { ArrowRight } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useRef } from 'react';

import { Beacon, type Health, StateGlow } from '@/components/Beacon';
import { ProjectIcon } from '@/components/ProjectIcon';
import { cx, Panel, Tag } from '@/components/ui';
import { ago } from '@/lib/format';
import { useFlip } from '@/lib/useFlip';

export type CollectionItem = {
  slug: string;
  href: string;
  icon: string | null;
  engine?: boolean;
  domain: string;
  repo: string;
  health: Health;
  lastDeploy: string;
  services: { name: string; type: string }[];
};

/**
 * Projects as a grid or a list. The collection is keyed by view and filter, so
 * changing either replays the entrance for every tile; a change of order alone
 * keeps the tiles and slides each one from its old place (FLIP).
 */
export function ProjectsCollection({ items, view, filterKey }: { items: CollectionItem[]; view: 'grid' | 'list'; filterKey: string }) {
  return <Collection key={`${view}-${filterKey}`} items={items} view={view} />;
}

function Collection({ items, view }: { items: CollectionItem[]; view: 'grid' | 'list' }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, items.map((p) => p.slug).join('|'));

  if (items.length === 0) {
    return <Panel className="rise-in px-6 py-10 text-center text-[14.5px] text-fg-3">No project matches this filter.</Panel>;
  }

  if (view === 'list') {
    return (
      <div ref={ref}>
        <Panel className="overflow-hidden">
          {items.map((p, i) => (
            <Link
              key={p.slug}
              data-flip={p.slug}
              style={{ animationDelay: `${60 + i * 35}ms` }}
              href={p.href}
              className={cx(
                'rise-in group relative isolate flex items-center gap-4 overflow-hidden px-5 py-3.5 transition-colors duration-150 hover:bg-bg-3/40',
                i > 0 && 'border-t border-line',
              )}
            >
              <StateGlow health={p.health} />
              <ProjectIcon slug={p.slug} src={p.icon} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{p.slug}</span>
                  {!p.engine && <Tag>sample</Tag>}
                </span>
                <span className="block truncate text-[13px] text-fg-3">{p.domain}</span>
              </span>
              <span className="hidden flex-wrap justify-end gap-1.5 md:flex">
                {p.services.map((s) => (
                  <Tag key={s.name} tone={s.type === 'stateful' ? 'info' : undefined}>
                    {s.name}
                  </Tag>
                ))}
              </span>
              <span className="hidden w-[180px] shrink-0 truncate text-right text-[13px] text-fg-3 lg:block">
                {p.health === 'stopped' ? 'Stopped' : `Deployed ${ago(p.lastDeploy)}`}
              </span>
              <Beacon health={p.health} />
              <ArrowRight size={15} className="shrink-0 text-fg-3 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          ))}
        </Panel>
      </div>
    );
  }

  return (
    <div ref={ref} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((p, i) => (
        <Link
          key={p.slug}
          data-flip={p.slug}
          style={{ animationDelay: `${60 + i * 45}ms` }}
          href={p.href}
          className="rise-in hover-lift group relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-bg-2 p-5 transition-[translate,border-color,background-color,box-shadow] duration-300 ease-[var(--ease-out)] hover:-translate-y-1 hover:border-fg-3/60 hover:bg-bg-3/40 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.6)] active:translate-y-0 active:duration-100"
        >
          <StateGlow health={p.health} />
          <span className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <ProjectIcon slug={p.slug} src={p.icon} />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-display text-[18px] leading-tight font-semibold tracking-tight">{p.slug}</span>
                  {!p.engine && <Tag>sample</Tag>}
                </span>
                <span className="block truncate text-[13.5px] text-fg-2">{p.domain}</span>
              </span>
            </span>
            <Beacon health={p.health} showLabel />
          </span>
          <span className="flex flex-wrap gap-1.5">
            {p.services.map((s) => (
              <Tag key={s.name} tone={s.type === 'stateful' ? 'info' : undefined}>
                {s.name}
              </Tag>
            ))}
          </span>
          <span className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3.5 text-[13px] text-fg-3">
            <span>{p.health === 'stopped' ? 'Stopped' : `Deployed ${ago(p.lastDeploy)}`}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{p.repo.split('/').slice(1).join('/')}</span>
              <ArrowRight
                size={15}
                className="shrink-0 -translate-x-1 text-fg-2 opacity-0 transition-[opacity,translate] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100"
              />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
