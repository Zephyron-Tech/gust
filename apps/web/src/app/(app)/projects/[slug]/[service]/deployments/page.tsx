'use client';

import { environmentOf } from '@gust/contracts';
import { CaretRight } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { use, useState } from 'react';
import { Ago } from '@/components/Ago';
import { EnvBadge } from '@/components/EnvBadge';
import { Segmented } from '@/components/Segmented';

import { Code, Panel, Pill } from '@/components/ui';
import { useDemo } from '@/lib/demo';
import { triggerLabel } from '@/lib/deploy-labels';

type Filter = 'all' | 'production' | 'previews';

export default function DeploymentsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = use(params);
  const { deployments, failNext, setFailNext, isEngine } = useDemo();
  const all = deployments.filter((d) => d.project === slug && d.service === service);
  const hasPreviews = all.some((d) => environmentOf(d).kind === 'preview');
  const [filter, setFilter] = useState<Filter>('all');
  const list = all.filter((d) => {
    const kind = environmentOf(d).kind;
    if (filter === 'production') return kind === 'production';
    if (filter === 'previews') return kind === 'preview';
    return true;
  });

  return (
    <div className="view-in space-y-4">
      {hasPreviews && (
        <Segmented options={['all', 'production', 'previews'] as const} value={filter} onChange={setFilter} label="Filter deployments" />
      )}
      <Panel className="overflow-hidden">
        {list.map((d, i) => {
          const env = environmentOf(d);
          return (
            <Link
              key={d.id}
              href={`/projects/${slug}/${service}/deployments/${d.id}`}
              className={`group grid grid-cols-[92px_136px_minmax(0,1fr)_72px_104px_20px] items-center gap-3 px-5 py-4 xl:grid-cols-[100px_148px_minmax(0,1fr)_80px_112px_52px_20px] xl:gap-4 transition-colors duration-150 hover:bg-bg-3/60 active:bg-bg-3 ${i ? 'border-t border-line' : ''} ${Date.now() - new Date(d.createdAt).getTime() < 4000 ? 'row-in' : ''}`}
            >
              <Pill state={d.state} />
              <EnvBadge env={env} className="max-w-full" />
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] text-fg">{d.message}</span>
                <span className="block truncate text-[13px] text-fg-3">
                  {d.author} · {triggerLabel(d)}
                  {env.kind === 'preview' && d.previewUrl && d.state === 'live' && <> · {new URL(d.previewUrl).host}</>}
                </span>
              </span>
              <Code className="block truncate text-fg-2">{d.sha}</Code>
              <Ago iso={d.createdAt} className="text-[13.5px] whitespace-nowrap text-fg-3" />
              <span className="text-right text-[13.5px] text-fg-3 tabular-nums max-xl:hidden">{d.duration ?? ''}</span>
              <CaretRight
                size={16}
                className="text-fg-3 transition-[translate,color] duration-200 ease-[var(--ease-out)] group-hover:translate-x-1 group-hover:text-fg-2"
              />
            </Link>
          );
        })}
        {list.length === 0 && (
          <p className="px-5 py-10 text-center text-fg-3">
            No deployments yet.{' '}
            <Link href={`/projects/${slug}/${service}/setup`} className="text-accent">
              Set up deploys from GitHub
            </Link>
          </p>
        )}
      </Panel>
      {!isEngine(slug) && (
        <label className="flex w-max items-center gap-2.5 text-[14px] text-fg-3">
          <input
            type="checkbox"
            checked={failNext}
            onChange={(e) => setFailNext(e.target.checked)}
            className="size-4 accent-[var(--g-err)]"
          />
          Demo: let the next deploy fail its health check
        </label>
      )}
    </div>
  );
}
