'use client';

// Deployments in the UI. Projects marked `engine` deploy for real: the browser
// asks /api/engine/deploy, which calls the engine and streams its events back.
// Everything else is sample data played through the same states. Until the
// database exists, history of real deploys lives in this tab only; on load the
// running containers are read back from the engine.
import { Toast } from '@base-ui/react/toast';
import { type Deployment, type DeployState, RUNNING_STATES } from '@gust/contracts';
import { nextCommits, projects, deployments as seed } from '@gust/contracts/sample';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { clock } from './format';

export type UiDeployment = Deployment & { containerId?: string; engine?: boolean };

const isEngine = (project: string) => projects.some((p) => p.slug === project && p.engine);

interface Demo {
  deployments: UiDeployment[];
  busy: (project: string, service: string) => boolean;
  deploy: (project: string, service: string, rollbackOf?: Deployment, tag?: string) => void;
  /** null while loading, false when the engine does not answer. */
  engineUp: boolean | null;
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
  const [deployments, setDeployments] = useState<UiDeployment[]>(seed);
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const [failNext, setFailNext] = useState(false);
  const [diskAlert, setDiskAlert] = useState(false);
  const timers = useRef<number[]>([]);
  const seq = useRef(0);
  const toasts = Toast.useToastManager();
  const router = useRouter();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // What already runs on the engine becomes the live deployment of its service.
  useEffect(() => {
    let off = false;
    fetch('/api/engine/containers')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((list: { id: string; image: string; state: string; project?: string; service?: string; deployment?: string }[]) => {
        if (off) return;
        setEngineUp(true);
        const live: UiDeployment[] = list
          .filter((c) => c.state === 'running' && c.project && c.service && c.deployment && isEngine(c.project))
          .map((c) => ({
            id: c.deployment as string,
            project: c.project as string,
            service: c.service as string,
            sha: c.image.split(':').pop() ?? 'latest',
            message: `Running ${c.image}`,
            author: 'gust',
            branch: 'main',
            trigger: 'manual',
            state: 'live',
            createdAt: new Date().toISOString(),
            logs: [{ ts: clock(), phase: 'live', line: `Found running on the engine: ${c.image}` }],
            containerId: c.id,
            engine: true,
          }));
        setDeployments((all) => [...live, ...all.filter((d) => !live.some((l) => l.id === d.id))]);
      })
      .catch(() => !off && setEngineUp(false));
    return () => {
      off = true;
    };
  }, []);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: realDeploy reads the same state as its dependencies below
  const deploy = useCallback(
    (project: string, service: string, rollbackOf?: Deployment, tag?: string) => {
      if (busy(project, service)) return;
      if (isEngine(project)) {
        void realDeploy(project, service, rollbackOf, tag);
        return;
      }
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

  async function realDeploy(project: string, service: string, rollbackOf?: Deployment, tag?: string) {
    const version = rollbackOf?.sha ?? tag;
    if (!version) return;
    const id = `dpl_${Math.random().toString(36).slice(2, 10)}`;
    const prev = deployments.find((d) => d.project === project && d.service === service && d.state === 'live');
    const t0 = Date.now();
    const patch = (fn: (x: UiDeployment) => Partial<UiDeployment>) =>
      setDeployments((all) => all.map((x) => (x.id === id ? { ...x, ...fn(x) } : x)));
    setDeployments((all) => [
      {
        id,
        project,
        service,
        sha: version,
        message: rollbackOf ? `Roll back to ${version}` : `Deploy ${version}`,
        author: 'jan',
        branch: 'main',
        trigger: rollbackOf ? 'rollback' : 'manual',
        state: 'queued',
        createdAt: new Date().toISOString(),
        logs: [],
        engine: true,
      },
      ...all,
    ]);
    router.push(`/projects/${project}/${service}/deployments/${id}`);

    const res = await fetch('/api/engine/deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deploymentId: id, project, service, tag: version }),
    }).catch(() => null);
    if (!res?.ok || !res.body) {
      const msg = res ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : null;
      patch(() => ({ state: 'failed', error: msg ?? 'The engine did not answer' }));
      notify('Deploy did not start', msg ?? 'The engine did not answer.', 'err');
      return;
    }

    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buf = '';
    let ok = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = /^event: (.*)$/m.exec(frame)?.[1];
        const data = /^data: (.*)$/m.exec(frame)?.[1];
        if (!data) continue;
        const e = JSON.parse(data);
        if (event === 'deploy') {
          const ts = new Date(e.ts).toLocaleTimeString('en-GB', { hour12: false });
          patch((x) => ({
            logs: [...x.logs, { ts, phase: e.phase, line: e.line }],
            ...(e.state ? { state: e.state } : {}),
            ...(e.containerId ? { containerId: e.containerId } : {}),
            ...(e.phase === 'fail' ? { error: e.line } : {}),
          }));
        }
        if (event === 'done') ok = Boolean(e.ok);
      }
    }
    const secs = Math.round((Date.now() - t0) / 1000);
    patch(() => ({ duration: `${secs} s` }));
    if (ok) {
      setDeployments((all) => all.map((x) => (prev && x.id === prev.id ? { ...x, state: 'superseded' } : x)));
      notify(`${project}/${service} is live`, `${rollbackOf ? 'Rolled back to' : 'Deployed'} ${version} in ${secs} s.`);
    } else {
      notify('Deploy failed', `${project}/${service}: the previous version keeps serving.`, 'err');
    }
  }

  const value = useMemo(
    () => ({ deployments, busy, deploy, engineUp, failNext, setFailNext, diskAlert, setDiskAlert, notify }),
    [deployments, busy, deploy, engineUp, failNext, diskAlert, notify],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
