import { Pill, Table, Td } from '@/components/ui';
import { getProject } from '@/lib/data';
import { serverIp } from '@/lib/public-url';

export default async function DomainsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug } = await params;
  const project = await getProject(slug);
  const ip = serverIp();
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
        {ip ? (
          <>
            Point an A record at <span className="font-mono text-[13px] text-fg">{ip}</span>. Gust requests the certificate as soon as the
            name resolves.
          </>
        ) : (
          <>
            Server IP not set. Add <span className="font-mono text-[13px] text-fg">GUST_SERVER_IP</span> to /opt/gust/.env, then restart
            web. Until then the A record target is shown as <span className="font-mono text-[13px] text-fg">-</span>.
          </>
        )}
      </p>
    </div>
  );
}
