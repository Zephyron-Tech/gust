'use client';

// Client-side stand-in for the backend: holds sample deployments and plays a
// deploy or rollback through its states, with logs, as the worker will.
import { Toast } from '@base-ui/react/toast';
import { type Deployment, type DeployState, RUNNING_STATES } from '@gust/contracts';
import { nextCommits, deployments as seed } from '@gust/contracts/sample';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { clock } from './format';

interface Demo {
  deployments: Deployment[];
  busy: (project: string, service: string) => boolean;
  deploy: (project: string, service: string, rollbackOf?: Deployment) => void;
  failNext: boolean;
  setFailNext: (v: boolean) => void;
  diskAlert: boolean;
  setDiskAlert: (v: boolean) => void;
  notify: (title: string, description?: string, tone?: 'ok' | 'err') => void;
}

const Ctx = createContext<Demo | null>(null);

export function useDemo() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDemo outside DemoProvider');
  return v;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [deployments, setDeployments] = useState<Deployment[]>(seed);
  const [failNext, setFailNext] = useState(false);
  const [diskAlert, setDiskAlert] = useState(false);
  const timers = useRef<number[]>([]);
  const seq = useRef(0);
  const toasts = Toast.useToastManager();
  const router = useRouter();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const notify = useCallback(
    (title: string, description?: string, tone: 'ok' | 'err' = 'ok') => {
      toasts.add({ title, description, type: tone });
    },
    [toasts],
  );

  const busy = useCallback(
    (project: string, service: string) =>
      deployments.some((d) => d.project === project && d.service === service && RUNNING_STATES.includes(d.state)),
    [deployments],
  );

  const deploy = useCallback(
    (project: string, service: string, rollbackOf?: Deployment) => {
      if (busy(project, service)) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const k = reduce ? 0.4 : 1;
      const [sha, message, author] = nextCommits[seq.current++ % nextCommits.length] ?? ['0000000', 'Deploy', 'jan'];
      const willFail = !rollbackOf && failNext;
      const prev = deployments.find((d) => d.project === project && d.service === service && d.state === 'live');
      const id = `dpl_${Math.random().toString(36).slice(2, 8)}`;
      const d: Deployment = {
        id,
        project,
        service,
        sha: rollbackOf ? rollbackOf.sha : sha,
        message: rollbackOf ? `Roll back to ${rollbackOf.sha}` : message,
        author: rollbackOf ? 'jan' : author,
        branch: 'main',
        trigger: rollbackOf ? 'rollback' : 'push',
        state: 'queued',
        createdAt: new Date().toISOString(),
        logs: [{ ts: clock(), phase: 'queue', line: rollbackOf ? `${id} created by jan (rollback)` : `${id} queued by GitHub Actions` }],
      };
      const patch = (fn: (x: Deployment) => Partial<Deployment>, extra?: (all: Deployment[]) => Deployment[]) =>
        setDeployments((all) => {
          const next = all.map((x) => (x.id === id ? { ...x, ...fn(x) } : x));
          return extra ? extra(next) : next;
        });
      const log = (phase: string, line: string, state?: DeployState) =>
        patch((x) => ({ logs: [...x.logs, { ts: clock(), phase, line }], ...(state ? { state } : {}) }));
      const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms * k));

      setDeployments((all) => [d, ...all]);
      router.push(`/projects/${project}/${service}/deployments/${id}`);

      const run = `gust-${project}-${service}-${id.replace('_', '')}`;
      let t = 0;
      const step = (ms: number, fn: () => void) => {
        t += ms;
        later(t, fn);
      };
      if (rollbackOf) {
        step(500, () => log('pull', 'Image on this server, kept by the keep-5 rule', 'pulling'));
        step(500, () => log('start', `${run} on gust_edge`, 'starting'));
      } else {
        step(600, () => log('pull', `registry.gust.zephyron.tech/${project}/${service}:${d.sha}`, 'pulling'));
        step(900, () => log('pull', '5 layers, 3 cached · 38.7 MB'));
        step(700, () => log('start', `${run} on gust_edge, gust_proj_${project}`, 'starting'));
        step(400, () => log('start', '9 env variables injected (production)'));
      }
      step(700, () => log('health', 'GET /healthz → 503 (attempt 1)'));
      if (willFail) {
        step(900, () => log('health', 'GET /healthz → 503 (attempt 5)'));
        step(1000, () => log('health', 'no healthy response in 60 s'));
        step(600, () => {
          patch((x) => ({
            state: 'failed',
            error: 'Health check timed out after 60 s',
            duration: '1 min 3 s',
            logs: [...x.logs, { ts: clock(), phase: 'fail', line: `Container removed. ${prev?.id ?? 'Previous'} stays live.` }],
          }));
          notify('Deploy failed', `${project}/${service}: health check timed out. The previous version is still live.`, 'err');
        });
      } else {
        const secs = rollbackOf ? 6 : 38;
        step(800, () => log('health', 'GET /healthz → 200 (attempt 2)', 'healthy'));
        step(400, () => log('route', `Traefik: ${project}-${service} has 2 servers`));
        step(500, () => log('drain', `SIGTERM to ${prev?.id ?? 'previous'}, 10 s grace`));
        step(900, () => {
          patch(
            (x) => ({ state: 'live', duration: `${secs} s`, logs: [...x.logs, { ts: clock(), phase: 'live', line: `Live in ${secs} s` }] }),
            (all) => all.map((x) => (prev && x.id === prev.id ? { ...x, state: 'superseded' } : x)),
          );
          notify(`${project}/${service} is live`, `${rollbackOf ? 'Rolled back to' : 'Deployed'} ${d.sha} in ${secs} s`);
        });
      }
    },
    [busy, deployments, failNext, notify, router],
  );

  const value = useMemo(
    () => ({ deployments, busy, deploy, failNext, setFailNext, diskAlert, setDiskAlert, notify }),
    [deployments, busy, deploy, failNext, diskAlert, notify],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
