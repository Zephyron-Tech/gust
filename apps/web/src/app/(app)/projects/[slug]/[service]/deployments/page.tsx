'use client';

import Link from 'next/link';
import { use } from 'react';

import { Panel, Pill } from '@/components/ui';
import { useDemo } from '@/lib/demo';
import { ago } from '@/lib/format';

export default function DeploymentsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = use(params);
  const { deployments, failNext, setFailNext } = useDemo();
  const list = deployments.filter((d) => d.project === slug && d.service === service);

  return (
    <div className="view-in space-y-3">
      <Panel className="overflow-hidden">
        {list.map((d, i) => (
          <Link
            key={d.id}
            href={`/projects/${slug}/${service}/deployments/${d.id}`}
            className={`grid grid-cols-[112px_1fr_160px_110px_70px] items-center gap-4 px-[18px] py-3 transition-colors duration-100 hover:bg-bg-3 ${i ? 'border-t border-line' : ''}`}
          >
            <Pill state={d.state} />
            <span className="truncate">
              {d.message} <span className="text-fg-3">· {d.author}</span>
            </span>
            <span className="font-mono text-[12.5px] text-fg-3">
              {d.sha} · {d.trigger === 'rollback' ? 'rollback' : d.branch}
            </span>
            <span className="text-[13px] text-fg-3">{ago(d.createdAt)}</span>
            <span className="text-right font-mono text-[12.5px] text-fg-3">{d.duration ?? ''}</span>
          </Link>
        ))}
        {list.length === 0 && (
          <p className="px-5 py-8 text-center text-fg-3">No deployments yet. Push to main and GitHub Actions will start the first one.</p>
        )}
      </Panel>
      <label className="flex w-max items-center gap-2 text-[13px] text-fg-3">
        <input
          type="checkbox"
          checked={failNext}
          onChange={(e) => setFailNext(e.target.checked)}
          className="size-3.5 accent-[var(--g-err)]"
        />
        Demo: let the next deploy fail its health check
      </label>
    </div>
  );
}
