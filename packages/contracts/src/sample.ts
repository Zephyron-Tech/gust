// Sample data for the UI before the backend exists. Projects, domains and
// stacks are Zephyron's real ones; commits, people, times and numbers are made up.
import type { Alert, Deployment, Domain, EnvVar, LogLine, Project, RegistryRepo } from './index';

const MIN = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MIN).toISOString();

export const server = {
  name: 'contabo-vps6',
  plan: 'Contabo Cloud VPS 6',
  os: 'Ubuntu 24.04',
  vcpu: 6,
  ramGb: 12,
  diskGb: 100,
  uptimeDays: 41,
  ip: '203.0.113.24',
};

export const projects: Project[] = [
  {
    slug: 'demo',
    repo: 'Zephyron-Tech/gust (infra/demo-app)',
    domain: 'hello.localhost',
    health: 'live',
    lastDeploy: ago(5),
    engine: true,
    services: [
      {
        name: 'hello',
        type: 'app',
        image: 'demo/hello',
        port: 3000,
        healthPath: '/healthz',
        domains: ['hello.localhost'],
        cpu: 0.5,
        memoryMb: 128,
        health: 'live',
      },
    ],
  },
  {
    slug: 'zephyron-web',
    repo: 'Zephyron-Tech/zephyron-website',
    domain: 'zephyron.tech',
    health: 'live',
    lastDeploy: ago(12),
    services: [{ name: 'web', type: 'app', image: 'zephyron-web/web', port: 3000, healthPath: '/', cpu: 1, memoryMb: 512, health: 'live' }],
  },
  {
    slug: 'smart-targets',
    repo: 'Zephyron-Tech/smart-targets-core',
    domain: 'api.targets.zephyron.tech',
    health: 'live',
    lastDeploy: ago(120),
    services: [
      { name: 'api', type: 'app', image: 'smart-targets/api', port: 3000, healthPath: '/healthz', cpu: 1, memoryMb: 512, health: 'live' },
      { name: 'admin', type: 'app', image: 'smart-targets/admin', port: 3000, healthPath: '/', cpu: 0.5, memoryMb: 256, health: 'live' },
      { name: 'db', type: 'stateful', image: 'postgres:15', cpu: 1, memoryMb: 1024, health: 'live' },
    ],
  },
  {
    slug: 'gridtime',
    repo: 'Zephyron-Tech/GridTime',
    domain: 'gridtime.eu',
    health: 'live',
    lastDeploy: ago(60 * 26),
    services: [
      { name: 'frontend', type: 'app', image: 'gridtime/frontend', port: 3000, healthPath: '/', cpu: 0.5, memoryMb: 384, health: 'live' },
      {
        name: 'backend',
        type: 'app',
        image: 'gridtime/backend',
        port: 8000,
        healthPath: '/health',
        cpu: 0.5,
        memoryMb: 384,
        health: 'live',
      },
      { name: 'db', type: 'stateful', image: 'postgres:16', cpu: 1, memoryMb: 1024, health: 'live' },
    ],
  },
  {
    slug: 'moodtracker',
    repo: 'Zephyron-Tech/MoodTracker',
    domain: 'api.moodtracker.zephyron.tech',
    health: 'failed',
    lastDeploy: ago(60 * 72),
    services: [
      { name: 'api', type: 'app', image: 'moodtracker/api', port: 8080, healthPath: '/health', cpu: 0.5, memoryMb: 256, health: 'failed' },
      { name: 'db', type: 'stateful', image: 'postgres:16', cpu: 1, memoryMb: 1024, health: 'live' },
    ],
  },
  {
    slug: 'converter',
    repo: 'vandlj/universal-file-converter',
    domain: 'converter.zephyron.tech',
    health: 'live',
    lastDeploy: ago(60 * 24 * 5),
    services: [
      { name: 'frontend', type: 'app', image: 'converter/frontend', port: 3000, healthPath: '/', cpu: 0.5, memoryMb: 256, health: 'live' },
      {
        name: 'backend',
        type: 'app',
        image: 'converter/backend',
        port: 8000,
        healthPath: '/health',
        cpu: 1,
        memoryMb: 1024,
        health: 'live',
      },
      { name: 'redis', type: 'stateful', image: 'redis:7-alpine', cpu: 0.25, memoryMb: 128, health: 'live' },
    ],
  },
  {
    slug: 'clearway',
    repo: 'clearway-dev/clearway-data-backend',
    domain: 'api-mobile.zephyron.tech',
    health: 'stopped',
    lastDeploy: ago(60 * 24 * 40),
    services: [
      { name: 'api', type: 'app', image: 'clearway/api', port: 8000, healthPath: '/health', cpu: 1, memoryMb: 512, health: 'stopped' },
      { name: 'worker', type: 'app', image: 'clearway/api', cpu: 1, memoryMb: 512, health: 'stopped' },
      { name: 'db', type: 'stateful', image: 'postgis/postgis:16-3.4', cpu: 1, memoryMb: 2048, health: 'stopped' },
    ],
  },
];

const commits: [string, string, string][] = [
  ['a1c9e3f', 'Fix target sync on empty plan', 'jan'],
  ['9be41c7', 'Add audit export to admin', 'petr'],
  ['77f0d2b', 'Switch healthz to readiness probe', 'jan'],
  ['41aa0e8', 'Rate limit public API', 'jan'],
  ['3c7d9a1', 'Cache plan lookups per request', 'petr'],
  ['2e81f40', 'Upgrade Prisma to 7.1', 'petr'],
];

export function deployLogs(id: string, project: string, service: string, sha: string, failed: boolean, seconds = 41): LogLine[] {
  const run = `gust-${project}-${service}-${id.replace('_', '')}`;
  const base: LogLine[] = [
    { ts: '14:02:01', phase: 'queue', line: `${id} queued by GitHub Actions (Zephyron-Tech/${project}@main)` },
    { ts: '14:02:02', phase: 'pull', line: `registry.gust.zephyron.tech/${project}/${service}:${sha}` },
    { ts: '14:02:07', phase: 'pull', line: '5 layers, 3 cached · 41.2 MB' },
    { ts: '14:02:08', phase: 'start', line: `${run} on gust_edge, gust_proj_${project}` },
    { ts: '14:02:08', phase: 'start', line: '9 env variables injected (production)' },
    { ts: '14:02:11', phase: 'health', line: 'GET /healthz → 503 (attempt 1)' },
  ];
  if (failed) {
    return [
      ...base,
      { ts: '14:03:11', phase: 'health', line: 'no healthy response in 60 s' },
      { ts: '14:03:12', phase: 'fail', line: 'Container removed. The previous deployment stays live.' },
    ];
  }
  return [
    ...base,
    { ts: '14:02:13', phase: 'health', line: 'GET /healthz → 200 (attempt 2)' },
    { ts: '14:02:13', phase: 'route', line: `Traefik: ${project}-${service} has 2 servers` },
    { ts: '14:02:14', phase: 'drain', line: 'SIGTERM to previous, 10 s grace' },
    { ts: '14:02:24', phase: 'live', line: `Live in ${seconds} s` },
  ];
}

function history(project: string, service: string, startMinutes: number): Deployment[] {
  const states: Deployment['state'][] = ['live', 'superseded', 'failed', 'superseded', 'superseded', 'superseded'];
  return commits.map(([sha, message, author], i) => {
    const id = `dpl_${(project.slice(0, 2) + service.slice(0, 2) + sha.slice(0, 2)).toLowerCase()}${i}`;
    const state = states[i] ?? 'superseded';
    const failed = state === 'failed';
    return {
      id,
      project,
      service,
      sha,
      message,
      author,
      branch: 'main',
      trigger: 'push',
      state,
      createdAt: ago(startMinutes + i * 60 * 19),
      duration: failed ? '1 min 2 s' : `${38 + ((i * 3) % 7)} s`,
      error: failed ? 'Health check timed out after 60 s' : undefined,
      logs: deployLogs(id, project, service, sha, failed),
    };
  });
}

export const deployments: Deployment[] = projects
  .filter((p) => !p.engine)
  .flatMap((p) =>
    p.services.filter((s) => s.type === 'app').flatMap((s, i) => history(p.slug, s.name, i * 7 + (p.slug === 'smart-targets' ? 120 : 600))),
  );

export const domains: Record<string, Domain[]> = {
  'smart-targets': [
    { host: 'api.targets.zephyron.tech', service: 'api', tls: 'http01', renewsInDays: 61 },
    { host: 'admin.targets.zephyron.tech', service: 'admin', tls: 'http01', renewsInDays: 61 },
    { host: '*.smart-targets.preview.zephyron.tech', service: 'previews', tls: 'dns01', renewsInDays: 74 },
  ],
};

export const env: EnvVar[] = [
  { key: 'DATABASE_URL', value: 'postgres://app:k2Lq9x@gust-smart-targets-db:5432/app', secret: true, scope: 'production' },
  { key: 'JWT_SECRET', value: 'replace-me', secret: true, scope: 'production' },
  { key: 'SENTRY_DSN', value: 'https://4f1c@o88.ingest.sentry.io/88', secret: true, scope: 'production' },
  { key: 'NODE_ENV', value: 'production', secret: false, scope: 'production' },
  { key: 'PUBLIC_URL', value: 'https://api.targets.zephyron.tech', secret: false, scope: 'production' },
  { key: 'PUBLIC_URL', value: 'https://pr-42.smart-targets.preview.zephyron.tech', secret: false, scope: 'preview' },
];

export const registry: RegistryRepo[] = [
  { name: 'smart-targets/api', tags: 18, sizeMb: 612, robot: 'robot-smart-targets' },
  { name: 'smart-targets/admin', tags: 11, sizeMb: 240, robot: 'robot-smart-targets' },
  { name: 'zephyron-web/web', tags: 20, sizeMb: 1940, robot: 'robot-zephyron-web' },
  { name: 'gridtime/backend', tags: 7, sizeMb: 380, robot: 'robot-gridtime' },
  { name: 'gridtime/frontend', tags: 7, sizeMb: 520, robot: 'robot-gridtime' },
  { name: 'converter/backend', tags: 4, sizeMb: 1100, robot: 'robot-converter' },
];

export const alerts: Alert[] = [
  {
    id: 'alr_1',
    rule: 'RAM above 90 % for 5 min',
    severity: 'critical',
    state: 'resolved',
    detail: 'Peaked at 93 % during gridtime import',
    startedAt: ago(60 * 24 * 4),
    resolvedAt: ago(60 * 24 * 4 - 6),
  },
  {
    id: 'alr_2',
    rule: 'Container restart loop',
    severity: 'critical',
    state: 'resolved',
    detail: 'gust-gridtime-backend restarted 4 times in 10 min',
    startedAt: ago(60 * 24 * 12),
    resolvedAt: ago(60 * 24 * 12 - 14),
  },
];

export const containers = [
  { name: 'authentik-server', project: 'authentik', cpu: 3.1, memoryMb: 512, restarts: 0 },
  { name: 'outline', project: 'outline', cpu: 1.2, memoryMb: 298, restarts: 0 },
  { name: 'gust-smart-targets-api', project: 'smart-targets', cpu: 2.4, memoryMb: 186, restarts: 0 },
  { name: 'gust-zephyron-web-web', project: 'zephyron-web', cpu: 1.8, memoryMb: 164, restarts: 0 },
  { name: 'nextcloud-app', project: 'nextcloud', cpu: 0.9, memoryMb: 141, restarts: 0 },
  { name: 'gust-gridtime-backend', project: 'gridtime', cpu: 0.7, memoryMb: 122, restarts: 0 },
  { name: 'victoria-metrics', project: 'gust', cpu: 0.6, memoryMb: 96, restarts: 0 },
];

/** Sample commits used when the UI simulates a new deploy. */
export const nextCommits: [string, string, string][] = [
  ['b7e21d0', 'Add bulk import for quarterly targets', 'jan'],
  ['c3f9a12', 'Tighten admin CSV validation', 'jan'],
  ['e92b0c4', 'Move plan cache to Redis', 'petr'],
];
