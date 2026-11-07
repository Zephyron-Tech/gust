import { z } from 'zod';

import { DeployError, failInterrupted, startDeploy } from '@/lib/deploy-runner';
import { listDeployments } from '@/lib/deployments-db';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  await failInterrupted();
  return Response.json(await listDeployments(q.get('project') ?? undefined, q.get('service') ?? undefined));
}

const body = z.object({
  project: z.string().regex(/^[a-z0-9-]+$/),
  service: z.string().regex(/^[a-z0-9-]+$/),
  tag: z.string().regex(/^[\w][\w.-]{0,127}$/),
  rollbackOf: z
    .string()
    .regex(/^dpl_[a-z0-9]+$/)
    .optional(),
});

// Starts a deploy and returns its id right away; the deploy runs on the
// server and the UI follows it through GET /api/deployments/:id.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  try {
    // Until sign-in exists every deploy is attributed to the local admin.
    const id = await startDeploy({ ...parsed.data, author: 'jan' });
    return Response.json({ id }, { status: 202 });
  } catch (e) {
    if (e instanceof DeployError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
