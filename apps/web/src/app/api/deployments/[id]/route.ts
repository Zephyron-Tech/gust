import { requireUser } from '@/lib/auth';
import { getDeployment } from '@/lib/deployments-db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { id } = await params;
  const d = await getDeployment(id);
  return d ? Response.json(d) : Response.json({ error: 'Not found' }, { status: 404 });
}
