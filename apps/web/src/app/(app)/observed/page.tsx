'use client';

import { observed } from '@gust/contracts/sample';

import { btn, Code, PageHead, Pill, Table, Tag, Td } from '@/components/ui';
import { useDemo } from '@/lib/demo';
import { size } from '@/lib/format';

export default function ObservedPage() {
  const { notify } = useDemo();
  return (
    <div className="view-in space-y-7">
      <PageHead title="Observed stacks" sub="Docker Compose projects in /opt/docker. Gust shows them and can restart them, nothing else." />
      <p className="rounded-2xl border border-line bg-bg-2 px-5 py-3.5 text-[14px] text-fg-2">
        <span className="mr-2 rounded-md bg-bg-3 px-2 py-1 text-[12.5px] leading-none font-medium">sample</span>
        This page is not connected to the server yet. The stacks below are example data, and Restart changes nothing.
      </p>
      <Table head={['Stack', 'Domain', 'Containers', 'Memory', 'Status', '']}>
        {observed.map((o) => (
          <tr key={o.name}>
            <Td>
              <p className="font-medium text-fg">{o.name}</p>
              <Code className="text-fg-3">{o.path}</Code>
            </Td>
            <Td className="text-fg-2">{o.domain}</Td>
            <Td>
              <span className="flex flex-wrap gap-1.5">
                {o.containers.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </span>
            </Td>
            <Td className="tabular-nums">{size(o.memoryMb)}</Td>
            <Td>
              <Pill state="live" />
            </Td>
            <Td className="text-right">
              <button
                type="button"
                className={btn.secondary}
                onClick={() => notify('Sample data', `${o.name} is an example; nothing was restarted.`)}
              >
                Restart
              </button>
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
