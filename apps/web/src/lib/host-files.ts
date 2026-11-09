import 'server-only';

import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { type LastBackup, parseLastBackup, parseRegistryKeep, parseServerFacts, type ServerFacts } from './integrations';
import { linesFor, type Range } from './server-metrics';

// The host writes these files into the shared requests folder (see infra/prod/gust).
const dir = () => process.env.GUST_REQUESTS_DIR ?? '/gust-requests';

async function readFileOrNull(name: string): Promise<string | null> {
  return fs.readFile(path.join(dir(), name), 'utf8').catch(() => null);
}

// A metrics line is about 250 bytes; read a little more than the lines a range needs.
const BYTES_PER_LINE = 320;

/** The last `bytes` of a file, from its end, so a long history is never read whole. */
async function readTail(name: string, bytes: number): Promise<string | null> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(path.join(dir(), name), 'r');
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    await handle.read(buf, 0, buf.length, start);
    return buf.toString('utf8');
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

/** Host sampling as of now: the latest metrics line and the two container files. */
export async function readLiveMetrics() {
  return {
    latest: await readFileOrNull('metrics.json'),
    containerStats: (await readFileOrNull('containers.jsonl')) ?? '',
    containerInspect: (await readFileOrNull('containers.txt')) ?? '',
  };
}

/** Metrics lines covering `range`, read from the end of metrics.jsonl (null when not sampled yet). */
export async function readMetricsHistory(range: Range): Promise<string | null> {
  return readTail('metrics.jsonl', linesFor(range) * BYTES_PER_LINE);
}

/** The last backup `gust backup` wrote, or null. */
export async function readLastBackup(): Promise<LastBackup> {
  return parseLastBackup(await readFileOrNull('backup.json'));
}

/** The machine's facts as `gust version-check` wrote them, or null. */
export async function readServerFacts(): Promise<ServerFacts | null> {
  return parseServerFacts(await readFileOrNull('server.json'));
}

/** How many registry tags zot keeps, read by `gust version-check` from its config. */
export async function readRegistryKeep(): Promise<number | null> {
  return parseRegistryKeep(await readFileOrNull('registry.json'));
}
