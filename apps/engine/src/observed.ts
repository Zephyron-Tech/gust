// Docker Compose stacks on the host that Gust does not deploy (the Observed page).
// Gust lists them and can restart them, nothing else. A stack counts only when
// Compose says it lives under OBSERVED_ROOT, so Gust's own stack (/opt/gust) and
// anything Gust deploys (labelled gust.managed) are never touched from here.
import type { ObservedContainer, ObservedStack } from '@gust/contracts';
import { LABEL } from '@gust/contracts';
import type Dockerode from 'dockerode';

import { docker } from './docker';

export const OBSERVED_ROOT = (process.env.OBSERVED_ROOT ?? '/opt/docker').replace(/\/+$/, '');

const COMPOSE_PROJECT = 'com.docker.compose.project';
const COMPOSE_SERVICE = 'com.docker.compose.service';
const COMPOSE_DIR = 'com.docker.compose.project.working_dir';

/** A Compose project name as Compose writes it: lowercase letters, digits, dashes and underscores. */
export const STACK_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isObservedDir(dir: string | undefined): dir is string {
  return !!dir && dir.startsWith(`${OBSERVED_ROOT}/`) && !dir.includes('..');
}

/** The first host of a Traefik rule such as Host(`auth.example.cz`). */
export function hostFromRule(rule: string): string | null {
  return /Host\(`([^`]+)`\)/.exec(rule)?.[1] ?? null;
}

export function domainOf(labels: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(labels)) {
    if (/^traefik\.http\.routers\..+\.rule$/.test(key)) {
      const host = hostFromRule(value);
      if (host) return host;
    }
  }
  return null;
}

/** Memory in use by a container, without the page cache Docker counts too. */
async function memoryMb(container: Dockerode.Container): Promise<number | null> {
  const s = (await container.stats({ stream: false }).catch(() => null)) as {
    memory_stats?: { usage?: number; stats?: { inactive_file?: number; cache?: number } };
  } | null;
  const usage = s?.memory_stats?.usage;
  if (usage === undefined) return null;
  const cache = s?.memory_stats?.stats?.inactive_file ?? s?.memory_stats?.stats?.cache ?? 0;
  return Math.round(Math.max(usage - cache, 0) / 1024 / 1024);
}

/** The Compose containers of one project that Gust may act on. */
async function observedContainers(project: string) {
  const list = await docker.listContainers({ all: true, filters: { label: [`${COMPOSE_PROJECT}=${project}`] } });
  return list.filter((x) => !x.Labels[LABEL.managed] && isObservedDir(x.Labels[COMPOSE_DIR]));
}

export async function listObserved(): Promise<ObservedStack[]> {
  const list = await docker.listContainers({ all: true, filters: { label: [COMPOSE_PROJECT] } });
  const stacks = new Map<string, { path: string; domain: string | null; items: typeof list }>();
  for (const x of list) {
    const project = x.Labels[COMPOSE_PROJECT];
    const dir = x.Labels[COMPOSE_DIR];
    if (!project || !STACK_NAME.test(project) || x.Labels[LABEL.managed] || !isObservedDir(dir)) continue;
    const stack = stacks.get(project) ?? { path: dir, domain: null, items: [] };
    stack.domain ??= domainOf(x.Labels);
    stack.items.push(x);
    stacks.set(project, stack);
  }

  const out: ObservedStack[] = [];
  for (const [name, stack] of [...stacks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const containers: ObservedContainer[] = await Promise.all(
      stack.items
        .sort((a, b) => (a.Labels[COMPOSE_SERVICE] ?? '').localeCompare(b.Labels[COMPOSE_SERVICE] ?? ''))
        .map(async (x) => ({
          name: x.Labels[COMPOSE_SERVICE] ?? x.Names[0]?.slice(1) ?? x.Id.slice(0, 12),
          state: x.State,
          status: x.Status,
          memoryMb: x.State === 'running' ? await memoryMb(docker.getContainer(x.Id)) : null,
        })),
    );
    out.push({ name, path: stack.path, domain: stack.domain, containers });
  }
  return out;
}

/** Restarts every container of a stack. Returns the container names, or null when no such stack is observed. */
export async function restartObserved(project: string): Promise<string[] | null> {
  if (!STACK_NAME.test(project)) return null;
  const items = await observedContainers(project);
  if (items.length === 0) return null;
  await Promise.all(items.map((x) => docker.getContainer(x.Id).restart({ t: 15 })));
  return items.map((x) => x.Labels[COMPOSE_SERVICE] ?? x.Names[0]?.slice(1) ?? x.Id.slice(0, 12));
}
