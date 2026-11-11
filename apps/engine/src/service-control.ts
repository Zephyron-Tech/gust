// Stopping a service by hand: its running Gust containers leave Traefik first, then stop.
// They are kept, not removed, so their logs stay readable. Production and previews stop
// separately: scope picks which. Starting again is a normal deploy from the web, and the
// worker restores only what services.stopped / services.previews_stopped allow.
import { LABEL } from '@gust/contracts';

import { docker } from './docker';
import { drain, undrain } from './routing';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DRAIN_GRACE_MS = Number(process.env.GUST_DRAIN_GRACE_MS ?? 2000);

export type StopScope = 'production' | 'previews' | 'all';

/** Whether a container with these labels belongs to the scope. Production has no branch label. */
export function inScope(labels: Record<string, string | undefined>, scope: StopScope): boolean {
  const preview = labels[LABEL.branch] !== undefined;
  if (scope === 'all') return true;
  return scope === 'previews' ? preview : !preview;
}

/** Stops every running managed container of one service in the scope. Returns their names. */
export async function stopService(project: string, service: string, scope: StopScope = 'all'): Promise<string[]> {
  const found = await docker.listContainers({
    filters: {
      label: [`${LABEL.managed}=true`, `${LABEL.project}=${project}`, `${LABEL.service}=${service}`],
      status: ['running'],
    },
  });
  const list = found.filter((c) => inScope(c.Labels, scope));
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
