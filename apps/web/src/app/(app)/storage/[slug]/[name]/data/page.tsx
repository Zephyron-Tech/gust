import { notFound } from 'next/navigation';

import { DataBrowser } from '@/components/DataBrowser';
import { lookupDatabase } from '@/lib/databases-db';

export const metadata = { title: 'Data' };
export const dynamic = 'force-dynamic';

export default async function StorageDataPage({ params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  const row = await lookupDatabase(slug, name);
  if (row?.kind !== 'postgres') notFound();
  if (row.state !== 'ready') return <p className="text-[14.5px] text-fg-3">The database is not ready yet.</p>;
  return <DataBrowser slug={slug} name={name} />;
}
