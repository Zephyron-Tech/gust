import { getProject } from '@/lib/data';

import { LogsView } from './logs-view';

export const dynamic = 'force-dynamic';

export default async function LogsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = await params;
  // Read from the database: a project added in the UI streams from the engine like the others.
  const project = await getProject(slug);
  return <LogsView slug={slug} service={service} engine={project?.engine === true} />;
}
