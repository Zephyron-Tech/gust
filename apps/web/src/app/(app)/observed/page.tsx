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
                onClick={() => notify(`${o.name} restarted`, 'All containers of the stack are healthy again.')}
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
