import { requireUser } from '@/lib/auth';
import { getServiceRow } from '@/lib/data';
import { DeployError, startDeploy } from '@/lib/deploy-runner';
import { removeDomain } from '@/lib/domains-db';

// Admins only. A routed domain stops serving with a production redeploy of
// the live image, started here (blue/green, no downtime).
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; service: string; host: string }> }) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, service, host } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const { found, redeployTag } = await removeDomain(row, decodeURIComponent(host), u.email);
  if (!found) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!redeployTag) return Response.json({ ok: true, deploymentId: null });
  try {
    const id = await startDeploy({ project: slug, service, tag: redeployTag, author: u.name, actor: u.email });
    return Response.json({ ok: true, deploymentId: id });
  } catch (e) {
    // A deploy is already running; the next one leaves the domain out anyway.
    if (e instanceof DeployError) return Response.json({ ok: true, deploymentId: null, note: e.message });
    throw e;
  }
}
