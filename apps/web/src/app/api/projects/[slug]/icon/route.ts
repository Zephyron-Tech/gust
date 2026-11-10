import { auditEvents, db, projects } from '@gust/db';
import { eq } from 'drizzle-orm';

import { requireUser } from '@/lib/auth';
import { ICON_MAX_BYTES, sniffIcon } from '@/lib/project-icon';
import { refreshIconFromSite } from '@/lib/project-icon-fetch';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

// Icons are served with the app's global security headers (nosniff, frame
// denial, no objects). An uploaded SVG is checked for scripts and foreign
// content before it is stored, so it cannot run anything when opened.
const ICON_HEADERS = { 'x-content-type-options': 'nosniff' };

async function loadProject(slug: string) {
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
  return project ?? null;
}

// The icon itself. Any signed-in user may see it, so the list can show it.
export async function GET(req: Request, { params }: Ctx) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const project = await loadProject((await params).slug);
  if (!project?.iconData || !project.iconType) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(Buffer.from(project.iconData, 'base64')), {
    headers: { ...ICON_HEADERS, 'content-type': project.iconType, 'cache-control': 'private, max-age=3600' },
  });
}

// Upload an icon by hand. Admins only; it wins over the site's favicon from now on.
export async function PUT(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;
  const project = await loadProject(slug);
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });

  // Refuse oversized bodies before they are read into memory.
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > ICON_MAX_BYTES + 64 * 1024) return Response.json({ error: 'The icon is larger than 256 KB' }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Choose an image to upload' }, { status: 400 });
  if (file.size > ICON_MAX_BYTES) return Response.json({ error: 'The icon is larger than 256 KB' }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffIcon(bytes);
  if (!type) return Response.json({ error: 'Use a PNG, JPEG, GIF, WebP, ICO or a plain SVG' }, { status: 400 });

  const now = new Date();
  await db
    .update(projects)
    .set({ iconType: type, iconData: Buffer.from(bytes).toString('base64'), iconSource: 'manual', iconUpdatedAt: now, iconCheckedAt: now })
    .where(eq(projects.id, project.id));
  await db
    .insert(auditEvents)
    .values({ actor: u.email, action: 'project.icon.upload', target: slug, detail: { type, bytes: bytes.byteLength } });
  return Response.json({ ok: true });
}

// Take the icon from the live site again, replacing an uploaded one. Admins only.
export async function POST(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;
  if (!(await loadProject(slug))) return Response.json({ error: 'Not found' }, { status: 404 });
  const found = await refreshIconFromSite(slug, true);
  if (!found) return Response.json({ error: 'The site has no icon Gust can use. Upload one instead.' }, { status: 422 });
  return Response.json({ ok: true });
}

// Remove the icon; the letter comes back, and the site's favicon is not fetched again.
export async function DELETE(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;
  const project = await loadProject(slug);
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
  await db
    .update(projects)
    .set({ iconType: null, iconData: null, iconSource: 'removed', iconUpdatedAt: new Date() })
    .where(eq(projects.id, project.id));
  await db.insert(auditEvents).values({ actor: u.email, action: 'project.icon.remove', target: slug, detail: {} });
  return Response.json({ ok: true });
}
