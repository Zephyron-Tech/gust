import { projects } from '@gust/contracts/sample';
import { notFound, redirect } from 'next/navigation';

export default async function ProjectIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = projects.find((x) => x.slug === slug);
  if (!p) notFound();
  const first = p.services.find((s) => s.type === 'app') ?? p.services[0];
  redirect(`/projects/${slug}/${first?.name}/${first?.type === 'stateful' ? 'settings' : 'deployments'}`);
}
