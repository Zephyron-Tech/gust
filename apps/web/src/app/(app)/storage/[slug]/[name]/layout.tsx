import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Tag } from '@/components/ui';
import { lookupDatabase } from '@/lib/databases-db';
import { StorageTabs } from './tabs';

export const dynamic = 'force-dynamic';

const STATE = {
  provisioning: { label: 'Creating', ink: 'text-warn' },
  ready: { label: 'Ready', ink: 'text-ok' },
  failed: { label: 'Failed', ink: 'text-err' },
  deleting: { label: 'Deleting', ink: 'text-warn' },
} as const;

export default async function StorageDatabaseLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string; name: string }>;
  children: ReactNode;
}) {
  const { slug, name } = await params;
  const row = await lookupDatabase(slug, name);
  if (!row) notFound();
  const word = STATE[row.state];
  // Data and Query read tables: only a Postgres database has them.
  const tabs =
    row.kind === 'postgres'
      ? [
          { key: 'overview', label: 'Overview' },
          { key: 'data', label: 'Data' },
          { key: 'query', label: 'Query' },
        ]
      : [{ key: 'overview', label: 'Overview' }];

  return (
    <div className="view-in space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[14px] text-fg-3">
        <Link href="/storage" className="hover:text-fg">
          Storage
        </Link>
        <span>/</span>
        <span className="text-fg">{row.database}</span>
      </nav>
      <div className="space-y-1.5">
        <h1 className="flex flex-wrap items-center gap-3 text-[30px] leading-[1.1]">
          {row.name}
          <Tag>{slug}</Tag>
          {row.kind === 'redis' && <Tag>Redis</Tag>}
          <span className={`text-[14px] font-medium ${word.ink}`}>{word.label}</span>
        </h1>
        <p className="font-mono text-[13px] text-fg-3">{row.database}</p>
      </div>
      <StorageTabs base={`/storage/${slug}/${name}`} tabs={tabs} />
      {children}
    </div>
  );
}
