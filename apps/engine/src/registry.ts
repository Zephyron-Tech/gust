// Zot is the registry, not a deployed app, so it has no gust.managed label. The engine restarts
// only the compose service `zot`, and only when its image is the Zot image. Nothing else.
import { docker } from './docker';

export async function reloadRegistry(): Promise<{ restarted: boolean }> {
  const list = await docker.listContainers({
    all: true,
    filters: { label: ['com.docker.compose.service=zot'] },
  });
  const zot = list.find((c) => c.Image.includes('project-zot/zot'));
  if (!zot) return { restarted: false };
  await docker.getContainer(zot.Id).restart({ t: 10 });
  return { restarted: true };
}
