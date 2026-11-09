import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { type LastBackup, parseLastBackup } from './integrations';

/** The last backup `gust backup` wrote into the shared requests folder, or null. */
export async function readLastBackup(): Promise<LastBackup> {
  const dir = process.env.GUST_REQUESTS_DIR ?? '/gust-requests';
  const raw = await fs.readFile(path.join(dir, 'backup.json'), 'utf8').catch(() => null);
  return parseLastBackup(raw);
}
