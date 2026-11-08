import Docker from 'dockerode';

// The engine never touches /var/run/docker.sock itself: it speaks to the
// socket proxy, which only lets through the API sections Gust needs.
function client() {
  const url = new URL(process.env.DOCKER_HOST ?? 'tcp://127.0.0.1:2375');
  return new Docker({ host: url.hostname, port: Number(url.port || 2375), protocol: 'http' });
}

export const docker = client();

export const EDGE_NETWORK = process.env.GUST_EDGE_NETWORK ?? 'gust_edge';

// Images from Gust's own registry are pulled with its read-only account
// (REGISTRY_USERNAME / REGISTRY_PASSWORD). Locally the registry is open and
// both are unset.
function registryAuth(image: string) {
  const host = process.env.REGISTRY_HOST;
  const username = process.env.REGISTRY_USERNAME;
  const password = process.env.REGISTRY_PASSWORD;
  if (!host || !username || !password || !image.startsWith(`${host}/`)) return {};
  return { authconfig: { username, password, serveraddress: host } };
}

/** Pulls an image and resolves when every layer is in place. */
export async function pull(image: string, onProgress?: (line: string) => void): Promise<void> {
  const stream = await docker.pull(image, registryAuth(image));
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err) => (err ? reject(err) : resolve()),
      (e: { status?: string; id?: string }) => {
        if (e.status && /Pull complete|Downloaded newer|Image is up to date|Digest/.test(e.status))
          onProgress?.(`${e.id ? `${e.id}: ` : ''}${e.status}`);
      },
    );
  });
}

export async function imageExists(image: string) {
  try {
    await docker.getImage(image).inspect();
    return true;
  } catch {
    return false;
  }
}
