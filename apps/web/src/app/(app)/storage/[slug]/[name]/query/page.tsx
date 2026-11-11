import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { QueryConsole } from '@/components/QueryConsole';
import { currentUser } from '@/lib/auth';
import { lookupDatabase } from '@/lib/databases-db';

export const metadata = { title: 'Query' };
export const dynamic = 'force-dynamic';

export default async function StorageQueryPage({ params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  const [row, user] = await Promise.all([lookupDatabase(slug, name), headers().then(currentUser)]);
  if (row?.kind !== 'postgres') notFound();
  if (row.state !== 'ready') return <p className="text-[14.5px] text-fg-3">The database is not ready yet.</p>;
  return <QueryConsole slug={slug} name={name} admin={user?.role === 'admin'} />;
}
