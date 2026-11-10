'use client';

// Deployments in the UI. Projects marked `engine` deploy for real: the server
// runs the deploy and keeps it in the database (/api/deployments), and this
// store polls the rows while the tab is visible. Everything else is sample
// data played through the same states in the browser.
import { Toast } from '@base-ui/react/toast';
import { type Deployment, type DeployState, environmentOf, type Health, RUNNING_STATES } from '@gust/contracts';
import { nextCommits, projects, deployments as seed } from '@gust/contracts/sample';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { clock } from './format';

/** One deployment with its log, polled while it is still running. */
export function useDeploymentDetail(id: string, enabled: boolean) {
  const [d, setD] = useState<UiDeployment | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    let timer = 0;
    const load = async () => {
      const res = await fetch(`/api/deployments/${id}`).catch(() => null);
      const next = res?.ok ? ((await res.json()) as UiDeployment) : null;
      if (off) return;
      setD(next);
      if (next && RUNNING_STATES.includes(next.state)) timer = window.setTimeout(load, 700);
    };
    void load();
    return () => {
      off = true;
      clearTimeout(timer);
    };
  }, [id, enabled]);
  return d;
}

export type UiDeployment = Deployment & { containerId?: string; engine?: boolean };

/** A project as the sidebar and the command menu list it. */
export type ProjectLink = { slug: string; engine: boolean; health: Health; domain: string; href: string };

// Before the server's answer arrives, the sample data decides.
const sampleIsEngine = (project: string) => projects.some((p) => p.slug === project && p.engine);

interface Demo {
  deployments: UiDeployment[];
  /** Whether a deploy is running in one environment: production, or the preview of `branch`. */
  busy: (project: string, service: string, branch?: string | null) => boolean;
  /** Starts a deploy. With `branch` it redeploys that preview instead of production. */
  deploy: (project: string, service: string, rollbackOf?: Deployment, tag?: string, branch?: string | null) => void;
  /** Whether a project deploys through the engine, from the database. */
  isEngine: (project: string) => boolean;
  /** Every project, from the database; null until the first answer. */
  projects: ProjectLink[] | null;
  /** null while loading, false when the engine does not answer. */
  engineUp: boolean | null;
  failNext: boolean;
  setFailNext: (v: boolean) => void;
  notify: (title: string, description?: string, tone?: 'ok' | 'err') => void;
}

const Ctx = createContext<Demo | null>(null);

export function useDemo() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDemo outside DemoProvider');
  return v;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [sim, setDeployments] = useState<UiDeployment[]>(seed);
  const [real, setReal] = useState<UiDeployment[]>([]);
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const [projectList, setProjectList] = useState<ProjectLink[] | null>(null);
  const engineSlugs = useMemo(() => (projectList ? new Set(projectList.filter((p) => p.engine).map((p) => p.slug)) : null), [projectList]);
  const pathname = usePathname();
  const deployments = useMemo(() => [...real, ...sim], [real, sim]);
  const watching = useRef(new Set<string>());
  // Asks for the deployment list now; set by the polling effect below.
  const refresh = useRef<() => void>(() => {});
  const [failNext, setFailNext] = useState(false);
  const timers = useRef<number[]>([]);
  const seq = useRef(0);
  const toasts = Toast.useToastManager();
  const router = useRouter();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Is the engine there at all? Real projects show a notice when it is not.
  useEffect(() => {
    fetch('/api/engine/containers')
      .then((r) => setEngineUp(r.ok))
      .catch(() => setEngineUp(false));
  }, []);

  // Which projects deploy through the engine. Read from the database, so a project
  // imported after the sample data was written is a real one too. Reloaded on
  // every navigation, since a new project appears while the app stays open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pathname is the trigger, the body does not read it
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((list: ProjectLink[] | null) => {
        if (Array.isArray(list)) setProjectList(list);
      })
      .catch(() => null);
  }, [pathname]);

  const isEngine = useCallback((project: string) => (engineSlugs ? engineSlugs.has(project) : sampleIsEngine(project)), [engineSlugs]);

  const notify = useCallback(
    (title: string, description?: string, tone: 'ok' | 'err' = 'ok') => {
      toasts.add({ title, description, type: tone });
    },
    [toasts],
  );

  // Real deployments come from the database; poll while the tab is visible.
  // Deploys started here get a toast when they finish, even after a reload
  // they keep running on the server.
  useEffect(() => {
    let off = false;
    const load = async () => {
      if (document.hidden) return null;
      const list = (await fetch('/api/deployments')
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])) as UiDeployment[];
      if (off) return null;
      setReal(list);
      for (const d of list) {
        if (!watching.current.has(d.id) || RUNNING_STATES.includes(d.state)) continue;
        watching.current.delete(d.id);
        if (d.state === 'live')
          notify(
            `${d.project}/${d.service} is live`,
            `${d.trigger === 'rollback' ? 'Rolled back to' : 'Deployed'} ${d.sha} in ${d.duration ?? '?'}.`,
          );
        else notify('Deploy failed', `${d.project}/${d.service}: ${(d.error ?? 'see the log').replace(/\.+$/, '')}.`, 'err');
      }
      return list;
    };
    // Quick while a deploy moves, slow when nothing does: an idle tab should
    // not ask the database every second all day.
    let timer = 0;
    const loop = async () => {
      const list = await load();
      if (off) return;
      const moving = list?.some((d) => RUNNING_STATES.includes(d.state)) || watching.current.size > 0;
      timer = window.setTimeout(loop, moving ? 1200 : 5000);
    };
    void loop();
    // Back on the tab: catch up at once instead of waiting out the slow timer.
    const onVisible = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      void loop();
    };
    document.addEventListener('visibilitychange', onVisible);
    refresh.current = () => {
      clearTimeout(timer);
      void loop();
    };
    return () => {
      off = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [notify]);

  const busy = useCallback(
    // Per environment: a running preview does not block production, nor the other way round.
    (project: string, service: string, branch?: string | null) =>
      deployments.some((d) => {
        if (d.project !== project || d.service !== service || !RUNNING_STATES.includes(d.state)) return false;
        const env = environmentOf(d);
        return branch ? env.kind === 'preview' && env.branch === branch : env.kind === 'production';
      }),
    [deployments],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: realDeploy reads the same state as its dependencies below
  const deploy = useCallback(
    (project: string, service: string, rollbackOf?: Deployment, tag?: string, branch?: string | null) => {
      if (busy(project, service, branch)) return;
      if (isEngine(project)) {
        void realDeploy(project, service, rollbackOf, tag, branch);
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
    [busy, deployments, failNext, isEngine, notify, router],
  );

  async function realDeploy(project: string, service: string, rollbackOf?: Deployment, tag?: string, branch?: string | null) {
    const version = rollbackOf?.sha ?? tag;
    if (!version) return;
    const res = await fetch('/api/deployments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project, service, tag: version, rollbackOf: rollbackOf?.id, ...(branch && { branch }) }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res?.ok || !body?.id) {
      notify('Deploy did not start', body?.error ?? 'Gust did not answer.', 'err');
      return;
    }
    watching.current.add(body.id);
    refresh.current();
    router.push(`/projects/${project}/${service}/deployments/${body.id}`);
  }

  const value = useMemo(
    () => ({ deployments, busy, deploy, isEngine, projects: projectList, engineUp, failNext, setFailNext, notify }),
    [deployments, busy, deploy, isEngine, projectList, engineUp, failNext, notify],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
