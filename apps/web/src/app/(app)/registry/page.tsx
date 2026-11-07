import { registry } from '@gust/contracts/sample';

import { btn, Code, Meter, PageHead, Table, Td } from '@/components/ui';
import { size } from '@/lib/format';

export const metadata = { title: 'Registry' };

export default function RegistryPage() {
  const total = registry.reduce((n, r) => n + r.sizeMb, 0);
  return (
    <div className="view-in space-y-7">
      <PageHead
        title="Registry"
        sub="Zot · registry.gust.zephyron.tech · keeps the last 20 tags per repository"
        actions={
          <button type="button" className={btn.secondary}>
            Run garbage collection
          </button>
        }
      />
      <div className="max-w-md space-y-2">
        <div className="flex justify-between text-[14px] text-fg-3">
          <span>Disk used by images</span>
          <span className="tabular-nums">{size(total)} of 100 GB</span>
        </div>
        <Meter value={total / 1000} />
      </div>
      <Table head={['Repository', 'Tags', 'Size', 'Push access']}>
        {registry.map((r) => (
          <tr key={r.name}>
            <Td>
              <Code>{r.name}</Code>
            </Td>
            <Td className="tabular-nums">{r.tags}</Td>
            <Td className="tabular-nums">{size(r.sizeMb)}</Td>
            <Td className="text-fg-3">{r.robot}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
