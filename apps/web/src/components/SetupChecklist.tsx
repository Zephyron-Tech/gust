'use client';

import { ArrowClockwise, ArrowSquareOut, Check, Copy } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState, useTransition } from 'react';

import { useDemo } from '@/lib/demo';
import { btn, Code, cx, Panel, Pill } from './ui';

function Step({ n, done, title, children }: { n: number; done: boolean; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-4 px-6 py-5">
      <span
        className={cx(
          'grid size-7 place-items-center rounded-full text-[13px] font-semibold',
          done ? 'bg-ok/15 text-ok' : 'border border-line text-fg-2',
        )}
      >
        {done ? <Check size={14} weight="bold" aria-label="done" /> : n}
      </span>
      <div className="min-w-0 space-y-3">
        <p className="pt-0.5 text-[15px] font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** What is left before a new project's first deploy, checked against the repository and the deploy list. */
export function SetupChecklist(props: {
  slug: string;
  service: string;
  repo: string;
  host: string;
  workflow: string | null;
  /** Whether the found workflow runs on pull_request. */
  pullRequestTrigger: boolean;
  problem: string | null;
  yaml: string;
  workflowPath: string;
  createUrl: string;
}) {
  const router = useRouter();
  const { deployments } = useDemo();
  const [copied, setCopied] = useState(false);
  const [checking, startCheck] = useTransition();
  const mine = deployments.filter((d) => d.project === props.slug && d.service === props.service);
  const first = mine.at(-1);
  const latest = mine[0];

  async function copy() {
    await navigator.clipboard.writeText(props.yaml).catch(() => null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="view-in max-w-3xl space-y-5">
      <div className="space-y-1">
        <h2 className="text-[22px] leading-tight">Connect deploys</h2>
        <p className="text-[14.5px] text-fg-3">
          Gust deploys what GitHub Actions builds. Add the workflow once; every push to the branches deploys by itself.
        </p>
      </div>

      <Panel className="overflow-hidden">
        <ol className="divide-y divide-line">
          <Step n={1} done title="Project created">
            <p className="text-[14px] text-fg-2">
              Production will be served on{' '}
              <a href={`https://${props.host}`} target="_blank" rel="noreferrer" className="text-fg hover:text-accent">
                {props.host}
              </a>
              . Add your own domain in the Domains tab whenever you like.
            </p>
          </Step>

          <Step
            n={2}
            done={!!props.workflow}
            title={
              props.workflow ? (
                <>
                  Workflow found in <Code className="text-fg-2">{props.workflow}</Code>
                </>
              ) : (
                'Add the deploy workflow'
              )
            }
          >
            {props.problem && <p className="text-[14px] text-err">{props.problem}</p>}
            {props.workflow && !props.pullRequestTrigger && (
              <p className="text-[14px] text-fg-2">
                This workflow does not run on pull requests, so they get no preview. Add <Code className="text-fg">pull_request</Code> to
                its <Code className="text-fg">on:</Code> and skip forks with an <Code className="text-fg">if:</Code> on the job;
                docs/github.md has the example.
              </p>
            )}
            {!props.workflow && (
              <>
                <p className="text-[14px] text-fg-2">
                  Create <Code className="text-fg">{props.workflowPath}</Code> in {props.repo}. The button opens GitHub with the file filled
                  in; commit it there.
                </p>
                <pre className="max-h-72 overflow-auto rounded-xl border border-line bg-log px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-[#d6d5e4]">
                  {props.yaml}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <a href={props.createUrl} target="_blank" rel="noreferrer" className={btn.primary}>
                    Create on GitHub <ArrowSquareOut />
                  </a>
                  <button type="button" onClick={copy} className={btn.secondary}>
                    {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    disabled={checking}
                    onClick={() => startCheck(() => router.replace(`/projects/${props.slug}/${props.service}/setup?fresh=${Date.now()}`))}
                    className={btn.ghost}
                  >
                    <ArrowClockwise className={checking ? 'animate-spin' : undefined} /> Check again
                  </button>
                </div>
              </>
            )}
          </Step>

          <Step n={3} done={!!first} title="Registry secrets">
            <p className="text-[14px] text-fg-2">
              The workflow pushes the image with <Code className="text-fg">GUST_REGISTRY_USERNAME</Code> and{' '}
              <Code className="text-fg">GUST_REGISTRY_PASSWORD</Code>. Gust writes both into this repository's Actions secrets when the
              registry account above is created, so there is nothing to set by hand. If the card shows an error, retry it there.
            </p>
          </Step>

          <Step n={4} done={latest?.state === 'live'} title="First deploy">
            {latest ? (
              <div className="flex flex-wrap items-center gap-3 text-[14px]">
                <Pill state={latest.state} />
                <span className="min-w-0 truncate text-fg-2">{latest.message}</span>
                <Link href={`/projects/${props.slug}/${props.service}/deployments/${latest.id}`} className={btn.secondary}>
                  Open deploy
                </Link>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-[14px] text-fg-3">
                <span className="size-1.5 animate-pulse rounded-full bg-fg-3" />
                Waiting for the first push. This page updates on its own.
              </p>
            )}
          </Step>
        </ol>
      </Panel>

      <Link href={`/projects/${props.slug}/${props.service}/deployments`} className={btn.ghost}>
        Go to the project
      </Link>
    </div>
  );
}
