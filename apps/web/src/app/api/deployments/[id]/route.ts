import { getDeployment } from '@/lib/deployments-db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDeployment(id);
  return d ? Response.json(d) : Response.json({ error: 'Not found' }, { status: 404 });
}
