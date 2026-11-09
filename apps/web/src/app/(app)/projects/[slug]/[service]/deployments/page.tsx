'use client';

import { projects } from '@gust/contracts/sample';
import { CaretRight } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { use, useState } from 'react';
import { Ago } from '@/components/Ago';
import { Segmented } from '@/components/Segmented';

import { Code, Panel, Pill } from '@/components/ui';
import { useDemo } from '@/lib/demo';

type Filter = 'all' | 'production' | 'previews';

export default function DeploymentsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = use(params);
  const { deployments, failNext, setFailNext } = useDemo();
  const all = deployments.filter((d) => d.project === slug && d.service === service);
  const hasPreviews = all.some((d) => d.trigger === 'preview');
  const [filter, setFilter] = useState<Filter>('all');
  const list = all.filter((d) => {
    if (filter === 'production') return d.trigger !== 'preview';
    if (filter === 'previews') return d.trigger === 'preview';
    return true;
  });

  return (
    <div className="view-in space-y-4">
      {hasPreviews && (
        <Segmented options={['all', 'production', 'previews'] as const} value={filter} onChange={setFilter} label="Filter deployments" />
      )}
      <Panel className="overflow-hidden">
        {list.map((d, i) => (
          <Link
            key={d.id}
            href={`/projects/${slug}/${service}/deployments/${d.id}`}
            className={`group grid grid-cols-[120px_1fr_150px_130px_64px_20px] items-center gap-5 px-5 py-4 transition-colors duration-150 hover:bg-bg-3/60 active:bg-bg-3 ${i ? 'border-t border-line' : ''} ${Date.now() - new Date(d.createdAt).getTime() < 4000 ? 'row-in' : ''}`}
          >
            <Pill state={d.state} />
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] text-fg">{d.message}</span>
              <span className="text-[13px] text-fg-3">
                {d.author} ·{' '}
                {d.trigger === 'preview'
                  ? `preview · ${d.branch}`
                  : d.trigger === 'rollback'
                    ? 'rollback'
                    : d.trigger === 'manual'
                      ? 'deployed from Gust'
                      : d.trigger === 'reconcile'
                        ? 'restored by Gust'
                        : `push to ${d.branch}`}
              </span>
            </span>
            <Code className="text-fg-2">{d.sha}</Code>
            <Ago iso={d.createdAt} className="text-[13.5px] text-fg-3" />
            <span className="text-right text-[13.5px] text-fg-3 tabular-nums">{d.duration ?? ''}</span>
            <CaretRight
              size={16}
              className="text-fg-3 transition-[translate,color] duration-200 ease-[var(--ease-out)] group-hover:translate-x-1 group-hover:text-fg-2"
            />
          </Link>
        ))}
        {list.length === 0 && (
          <p className="px-5 py-10 text-center text-fg-3">No deployments yet. Push to main and GitHub Actions starts the first one.</p>
        )}
      </Panel>
      {!projects.some((p) => p.slug === slug && p.engine) && (
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
