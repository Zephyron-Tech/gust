// Stopping a service by hand: its running Gust containers (production and every
// preview) leave Traefik first, then stop. They are kept, not removed, so their
// logs stay readable. Starting again is a normal deploy from the worker; the
// worker does not restore a stopped service on its own (services.stopped).
import { LABEL } from '@gust/contracts';

import { docker } from './docker';
import { drain, undrain } from './routing';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DRAIN_GRACE_MS = Number(process.env.GUST_DRAIN_GRACE_MS ?? 2000);

/** Stops every running managed container of one service. Returns their names. */
export async function stopService(project: string, service: string): Promise<string[]> {
  const list = await docker.listContainers({
    filters: {
      label: [`${LABEL.managed}=true`, `${LABEL.project}=${project}`, `${LABEL.service}=${service}`],
      status: ['running'],
    },
  });
  if (list.length === 0) return [];
  for (const c of list) drain(c.Id);
  // Traefik polls its config every second; the grace covers the requests already in flight.
  await sleep(DRAIN_GRACE_MS);
  const names: string[] = [];
  for (const c of list) {
    await docker
      .getContainer(c.Id)
      .stop({ t: 15 })
      .catch(() => {});
    undrain(c.Id);
    names.push(c.Names[0]?.slice(1) ?? c.Id.slice(0, 12));
  }
  return names;
}
