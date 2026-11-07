// Fills an empty database with Zephyron's projects and services from the
// sample data. Safe to run again: existing rows are left as they are.
import { projects as sample } from '@gust/contracts/sample';

import { db, pool, projects, services } from './index';

for (const p of sample) {
  const projectId = `prj_${p.slug}`;
  await db
    .insert(projects)
    .values({ id: projectId, slug: p.slug, repo: p.repo, domain: p.domain, engine: Boolean(p.engine) })
    .onConflictDoNothing();
  for (const s of p.services) {
    await db
      .insert(services)
      .values({
        id: `svc_${p.slug}_${s.name}`,
        projectId,
        name: s.name,
        type: s.type,
        image: s.image,
        port: s.port ?? null,
        healthPath: s.healthPath ?? null,
        domains: s.domains ?? (s.type === 'app' && p.services.indexOf(s) === 0 ? [p.domain] : []),
        cpu: s.cpu,
        memoryMb: s.memoryMb,
      })
      .onConflictDoNothing();
  }
}

console.log(`seeded ${sample.length} projects`);
await pool.end();
