'use client';

import { observed } from '@gust/contracts/sample';

import { btn, PageHead, Pill, Table, Td } from '@/components/ui';
import { useDemo } from '@/lib/demo';
import { size } from '@/lib/format';

export default function ObservedPage() {
  const { notify } = useDemo();
  return (
    <div className="view-in space-y-5">
      <PageHead title="Observed stacks" sub="Docker Compose projects in /opt/docker. Gust shows them and can restart them, nothing else." />
      <Table head={['Stack', 'Domain', 'Containers', 'Memory', 'Status', '']}>
        {observed.map((o) => (
          <tr key={o.name}>
            <Td>
              <p className="font-medium">{o.name}</p>
              <p className="font-mono text-[12px] text-fg-3">{o.path}</p>
            </Td>
            <Td className="font-mono text-[12.5px]">{o.domain}</Td>
            <Td>
              <span className="flex flex-wrap gap-1.5">
                {o.containers.map((c) => (
                  <span key={c} className="rounded-md bg-bg-3 px-1.5 py-1 font-mono text-[11.5px] leading-none text-fg-2">
                    {c}
                  </span>
                ))}
              </span>
            </Td>
            <Td className="font-mono text-[12.5px]">{size(o.memoryMb)}</Td>
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
