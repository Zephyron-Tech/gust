// Disk cleanup on the host: images no container uses, and stopped containers Gust
// created (kept after a stop, or left by a failed deploy). Volumes and the build
// cache are not touched. Only images and containers the socket proxy already allows.
import { LABEL } from '@gust/contracts';

import { docker } from './docker';

export type Usage = {
  unusedImages: number;
  unusedImageMb: number;
  stoppedGustContainers: number;
};

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

export async function usage(): Promise<Usage> {
  const [images, containers] = await Promise.all([docker.listImages({ all: false }), docker.listContainers({ all: true })]);
  const inUse = new Set(containers.map((c) => c.ImageID));
  const unused = images.filter((i) => !inUse.has(i.Id));
  return {
    unusedImages: unused.length,
    unusedImageMb: mb(unused.reduce((sum, i) => sum + i.Size, 0)),
    stoppedGustContainers: containers.filter((c) => c.State !== 'running' && c.Labels[LABEL.managed] === 'true').length,
  };
}

export async function prune(opts: { images: boolean; containers: boolean }) {
  const result = { imagesDeleted: 0, containersDeleted: 0, spaceReclaimedMb: 0 };
  if (opts.containers) {
    const r = await docker.pruneContainers({ filters: { label: [`${LABEL.managed}=true`] } });
    result.containersDeleted = r.ContainersDeleted?.length ?? 0;
    result.spaceReclaimedMb += mb(r.SpaceReclaimed ?? 0);
  }
  if (opts.images) {
    // dangling=false prunes every image no container uses, not only untagged ones.
    const r = await docker.pruneImages({ filters: { dangling: ['false'] } });
    result.imagesDeleted = r.ImagesDeleted?.length ?? 0;
    result.spaceReclaimedMb += mb(r.SpaceReclaimed ?? 0);
  }
  return result;
}
