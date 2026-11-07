// Spike M0/1: does blue/green through Traefik really drop no requests?
//
// Needs the dev stack (`pnpm infra:up`), the demo images in the local
// registry (`pnpm infra:demo`) and the engine running (`pnpm dev:engine`). Sends requests to hello.localhost the whole
// time while it deploys v1, then v2, then a v3 that never gets healthy, then
// rolls back to v1, and counts every answer that is not a 200.
import { request } from 'node:http';

import type { DeploySpec } from '@gust/contracts';

import { running } from '../src/deploy';
import { docker } from '../src/docker';

const HOST = 'hello.localhost';
const base: Omit<DeploySpec, 'deploymentId' | 'image'> = {
  project: 'demo',
  service: 'hello',
  port: 3000,
  healthPath: '/healthz',
  domains: [HOST],
  // DRAIN_MS 0: the app exits right away on SIGTERM, like most apps do.
  env: { STARTUP_DELAY_MS: '1500', DRAIN_MS: '0' },
  cpu: 0.5,
  memoryMb: 128,
  healthTimeout: 20,
};

function get(): Promise<{ status: number; version?: string }> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port: 80, path: '/', headers: { host: HOST }, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, version: JSON.parse(body).version });
        } catch {
          resolve({ status: res.statusCode ?? 0 });
        }
      });
    });
    req.on('error', () => resolve({ status: 0 }));
    req.on('timeout', () => req.destroy());
    req.end();
  });
}

// Four clients in a loop until stopped; tallies status codes and versions.
function load() {
  const tally = { total: 0, errors: 0, codes: {} as Record<string, number>, versions: {} as Record<string, number> };
  let on = true;
  const worker = async () => {
    while (on) {
      const r = await get();
      tally.total++;
      tally.codes[r.status] = (tally.codes[r.status] ?? 0) + 1;
      if (r.status !== 200) tally.errors++;
      if (r.version) tally.versions[r.version] = (tally.versions[r.version] ?? 0) + 1;
    }
  };
  const done = Promise.all([worker(), worker(), worker(), worker()]);
  return {
    tally,
    stop: async () => {
      on = false;
      await done;
    },
  };
}

// Calls the running engine like the worker will, reading its SSE stream.
async function viaEngine(spec: DeploySpec, onEvent: (e: { phase: string; line: string }) => void) {
  const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? 4100}/v1/deployments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.ENGINE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(spec),
  });
  if (!res.ok || !res.body) throw new Error(`engine answered ${res.status}`);
  let buf = '';
  let result = { ok: false };
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i = buf.indexOf('\n\n');
    while (i >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(frame)?.[1];
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (data && event === 'deploy') onEvent(JSON.parse(data));
      if (data && event === 'done') result = JSON.parse(data);
      i = buf.indexOf('\n\n');
    }
  }
  return result;
}

let n = 0;
async function step(label: string, image: string, extraEnv: Record<string, string> = {}) {
  const id = `dpl_spike${Date.now().toString(36)}${n++}`;
  const t0 = Date.now();
  const result = await viaEngine({ ...base, deploymentId: id, image, env: { ...base.env, ...extraEnv } }, (e) =>
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} s  ${e.phase.padEnd(6)} ${e.line}`),
  );
  console.log(`  → ${label}: ${result.ok ? 'live' : 'failed'} in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  return result.ok;
}

async function main() {
  // Clean slate
  for (const c of await running('demo', 'hello')) await docker.getContainer(c.Id).remove({ force: true });

  console.log('1) First deploy of v1 (no traffic yet)');
  await step('v1', 'localhost:5050/demo/hello:v1');

  const l = load();
  await new Promise((r) => setTimeout(r, 1000));

  console.log('2) v1 → v2 under load');
  await step('v2', 'localhost:5050/demo/hello:v2');

  console.log('3) v3 that never becomes healthy, under load');
  await step('v3 (broken)', 'localhost:5050/demo/hello:v2', { FAIL_HEALTH: '1', VERSION: 'v3' });

  console.log('4) Rollback to v1 under load (image already local)');
  await step('rollback to v1', 'localhost:5050/demo/hello:v1');

  await new Promise((r) => setTimeout(r, 4000));
  await l.stop();

  const { tally } = l;
  console.log('Requests during steps 2–4:', tally.total);
  console.log('Status codes:', tally.codes);
  console.log('Versions served:', tally.versions);
  console.log(tally.errors === 0 ? 'RESULT: zero failed requests' : `RESULT: ${tally.errors} failed requests`);

  for (const c of await running('demo', 'hello')) await docker.getContainer(c.Id).remove({ force: true });
  process.exit(tally.errors === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
