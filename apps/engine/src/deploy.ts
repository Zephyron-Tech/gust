// Blue/green deploy of an `app` service:
//   1. pull the image (skipped when it is already on the server, e.g. a rollback)
//   2. start a new container next to the running one, with a Docker health check
//   3. wait until Docker reports it healthy; only then does the engine's
//      Traefik config include it
//   4. wait until Traefik lists it as a server of the service
//   5. take the old containers out of the config, wait until Traefik confirms,
//      give in-flight requests a moment, then stop them
// On any failure before step 5 the new container is removed and the old one
// keeps serving.
import { type DeployEvent, type DeploySpec, LABEL } from '@gust/contracts';
import type Docker from 'dockerode';

import { docker, EDGE_NETWORK, imageExists, pull } from './docker';
import { drain, routeName, undrain, waitTraefik } from './routing';

type Emit = (e: Omit<DeployEvent, 'ts'>) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const serviceName = (s: Pick<DeploySpec, 'project' | 'service'>) => routeName(s.project, s.service);

/** Seconds between leaving the load balancer and SIGTERM, for in-flight requests. */
const DRAIN_GRACE_MS = Number(process.env.GUST_DRAIN_GRACE_MS ?? 2000);

function labels(spec: DeploySpec): Record<string, string> {
  const l: Record<string, string> = {
    [LABEL.managed]: 'true',
    [LABEL.project]: spec.project,
    [LABEL.service]: spec.service,
    [LABEL.deployment]: spec.deploymentId,
    [LABEL.type]: 'app',
    'gust.port': String(spec.port),
  };
  if (spec.domains.length) l['gust.domains'] = spec.domains.join(',');
  return l;
}

/** Running containers of this service, oldest first. */
export async function running(project: string, service: string) {
  const list = await docker.listContainers({
    filters: { label: [`${LABEL.project}=${project}`, `${LABEL.service}=${service}`], status: ['running'] },
  });
  return list.sort((a, b) => a.Created - b.Created);
}

async function waitHealthy(c: Docker.Container, timeoutS: number, emit: Emit) {
  const until = Date.now() + timeoutS * 1000;
  let last = '';
  while (Date.now() < until) {
    const info = await c.inspect();
    const status = info.State.Health?.Status ?? (info.State.Running ? 'none' : info.State.Status);
    if (status !== last) {
      emit({ phase: 'health', line: `docker health: ${status}` });
      last = status;
    }
    if (status === 'healthy') return true;
    if (!info.State.Running) return false;
    await sleep(500);
  }
  return false;
}

export async function deploy(spec: DeploySpec, emit: Emit): Promise<{ ok: boolean; containerId?: string }> {
  const name = serviceName(spec);
  emit({ phase: 'queue', state: 'queued', line: `${spec.deploymentId} for ${spec.project}/${spec.service}` });

  // 1. Image
  if (await imageExists(spec.image)) {
    emit({ phase: 'pull', state: 'pulling', line: `${spec.image} is already on this server` });
  } else {
    emit({ phase: 'pull', state: 'pulling', line: spec.image });
    try {
      await pull(spec.image, (line) => emit({ phase: 'pull', line }));
    } catch (e) {
      emit({ phase: 'fail', state: 'failed', line: `Pull failed: ${(e as Error).message}` });
      return { ok: false };
    }
  }

  // 2. New container next to the old one
  const previous = await running(spec.project, spec.service);
  const container = await docker.createContainer({
    name: `gust-${name}-${spec.deploymentId.replace('_', '')}`,
    Image: spec.image,
    Env: Object.entries({ ...spec.env, PORT: String(spec.port) }).map(([k, v]) => `${k}=${v}`),
    Labels: labels(spec),
    Healthcheck: {
      // busybox wget exists in alpine images; Gust documents curl or wget as a requirement.
      Test: [
        'CMD-SHELL',
        `wget -qO- http://127.0.0.1:${spec.port}${spec.healthPath} >/dev/null || curl -fsS http://127.0.0.1:${spec.port}${spec.healthPath} >/dev/null`,
      ],
      Interval: 1_000_000_000,
      Timeout: 2_000_000_000,
      StartPeriod: 0,
      Retries: 3,
    },
    HostConfig: {
      NetworkMode: EDGE_NETWORK,
      RestartPolicy: { Name: 'unless-stopped' },
      NanoCpus: Math.round(spec.cpu * 1e9),
      Memory: spec.memoryMb * 1024 * 1024,
      LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
    },
  });
  await container.start();
  emit({
    phase: 'start',
    state: 'starting',
    line: `container ${container.id.slice(0, 12)} started on ${EDGE_NETWORK}`,
    containerId: container.id,
  });

  const remove = async (why: string) => {
    emit({ phase: 'fail', state: 'failed', line: `${why} Removing the new container; the previous one keeps serving.` });
    await container.remove({ force: true }).catch(() => {});
    return { ok: false };
  };

  // 3. Healthy according to Docker
  if (!(await waitHealthy(container, spec.healthTimeout, emit))) {
    return remove(`No healthy response on ${spec.healthPath} within ${spec.healthTimeout} s.`);
  }
  emit({ phase: 'health', state: 'healthy', line: `GET ${spec.healthPath} → healthy` });

  // 4. In Traefik's load balancer
  if (spec.domains.length) {
    const ip = (await container.inspect()).NetworkSettings.Networks[EDGE_NETWORK]?.IPAddress;
    const url = `http://${ip}:${spec.port}`;
    if (!ip || !(await waitTraefik(name, (urls) => urls.includes(url)))) return remove('Traefik did not pick up the new container.');
    emit({ phase: 'route', line: `Traefik: ${name} has ${previous.length + 1} server${previous.length ? 's' : ''}` });
  }

  // 5. Out of the load balancer first, then stop
  if (previous.length) {
    const oldUrls = previous.map((o) => `http://${o.NetworkSettings?.Networks?.[EDGE_NETWORK]?.IPAddress}:${spec.port}`);
    for (const old of previous) drain(old.Id);
    emit({ phase: 'drain', line: `Taking ${previous.length} old container${previous.length > 1 ? 's' : ''} out of Traefik` });
    if (spec.domains.length) await waitTraefik(name, (urls) => !urls.some((u) => oldUrls.includes(u)));
    await new Promise((r) => setTimeout(r, DRAIN_GRACE_MS));
    for (const old of previous) {
      emit({ phase: 'drain', line: `SIGTERM to ${old.Names[0]?.slice(1) ?? old.Id.slice(0, 12)}` });
      const c = docker.getContainer(old.Id);
      await c.stop({ t: 15 }).catch(() => {});
      await c.remove().catch(() => {});
      undrain(old.Id);
    }
  }

  emit({
    phase: 'live',
    state: 'live',
    line: `Live${spec.domains.length ? ` on ${spec.domains.join(', ')}` : ''}`,
    containerId: container.id,
  });
  return { ok: true, containerId: container.id };
}
