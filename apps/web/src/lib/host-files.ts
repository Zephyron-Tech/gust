import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { type LastBackup, parseLastBackup, parseServerFacts, type ServerFacts } from './integrations';

// The host writes these files into the shared requests folder (see infra/prod/gust).
const dir = () => process.env.GUST_REQUESTS_DIR ?? '/gust-requests';

async function readFileOrNull(name: string): Promise<string | null> {
  return fs.readFile(path.join(dir(), name), 'utf8').catch(() => null);
}

/** The last backup `gust backup` wrote, or null. */
export async function readLastBackup(): Promise<LastBackup> {
  return parseLastBackup(await readFileOrNull('backup.json'));
}

/** The machine's facts as `gust version-check` wrote them, or null. */
export async function readServerFacts(): Promise<ServerFacts | null> {
  return parseServerFacts(await readFileOrNull('server.json'));
}
