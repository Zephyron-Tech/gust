import { redirect } from 'next/navigation';

export default async function ServiceIndex({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = await params;
  redirect(`/projects/${slug}/${service}/deployments`);
}
