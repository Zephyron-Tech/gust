// Fills an empty database with Zephyron's projects and services from the
// sample data. Safe to run again: existing rows are left as they are.
import { projects as sample, env as sampleEnv } from '@gust/contracts/sample';

import { db, envVars, pool, projects, services } from './index';
import { encryptSecret } from './secrets';

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

// Env vars: the sample set for smart-targets/api, and what the demo app reads.
const envSeed: { serviceId: string; key: string; value: string; secret: boolean; scope: 'production' | 'preview' }[] = [
  ...sampleEnv.map((e) => ({ serviceId: 'svc_smart-targets_api', key: e.key, value: e.value, secret: e.secret, scope: e.scope })),
  { serviceId: 'svc_demo_hello', key: 'STARTUP_DELAY_MS', value: '1500', secret: false, scope: 'production' },
  { serviceId: 'svc_demo_hello', key: 'GREETING', value: 'Hello from Gust', secret: false, scope: 'production' },
  { serviceId: 'svc_demo_hello', key: 'DEMO_API_TOKEN', value: 'demo-secret-change-me', secret: true, scope: 'production' },
];
for (const e of envSeed) {
  await db
    .insert(envVars)
    .values({
      id: `env_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      serviceId: e.serviceId,
      key: e.key,
      scope: e.scope,
      isSecret: e.secret,
      value: e.secret ? encryptSecret(e.value) : e.value,
    })
    .onConflictDoNothing();
}

console.log(`seeded ${sample.length} projects and ${envSeed.length} env vars`);
await pool.end();
