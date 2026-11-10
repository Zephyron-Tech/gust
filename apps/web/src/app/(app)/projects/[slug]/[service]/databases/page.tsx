import { notFound } from 'next/navigation';

import { DatabasesPanel } from '@/components/DatabasesPanel';
import { getProject } from '@/lib/data';
import { listProjectDatabases } from '@/lib/databases-db';

export const metadata = { title: 'Databases' };

export const dynamic = 'force-dynamic';

export default async function DatabasesPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = await params;
  const project = await getProject(slug);
  if (!project?.services.some((s) => s.name === service)) notFound();
  const initial = await listProjectDatabases(slug);
  return <DatabasesPanel slug={slug} initial={initial} />;
}
