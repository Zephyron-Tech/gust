import { server } from '@gust/contracts/sample';

import { Pill, Table, Td } from '@/components/ui';
import { getProject } from '@/lib/data';

export default async function DomainsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug } = await params;
  const project = await getProject(slug);
  // Hostnames come from the services' settings; certificates are issued by Traefik.
  const list = (project?.services ?? []).flatMap((s) =>
    (s.domains ?? []).map((host) => ({
      host,
      service: s.name,
      tls: host.startsWith('*.') ? ('dns01' as const) : ('http01' as const),
      renewsInDays: 61,
    })),
  );

  return (
    <div className="view-in space-y-4">
      <Table head={['Domain', 'Service', 'Certificate', 'Status']}>
        {list.map((d) => (
          <tr key={d.host}>
            <Td className="font-medium">{d.host}</Td>
            <Td>{d.service}</Td>
            <Td className="text-fg-3">
              {d.tls === 'dns01' ? 'Wildcard · DNS-01 via WEDOS' : `Let’s Encrypt · renews in ${d.renewsInDays} days`}
            </Td>
            <Td>
              <Pill state="live" />
            </Td>
          </tr>
        ))}
      </Table>
      <p className="rounded-2xl bg-info/10 px-5 py-3.5 text-[14px] text-fg-2">
        Point an A record at <span className="font-mono text-[13px] text-fg">{server.ip}</span>. Gust requests the certificate as soon as
        the name resolves.
      </p>
    </div>
  );
}
