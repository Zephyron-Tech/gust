import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LocalTime } from '@/components/LocalTime';
import { RegistryTagDelete } from '@/components/RegistryTagDelete';
import { Code, PageHead, Table, Td } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { size } from '@/lib/format';
import { NOT_SET } from '@/lib/integrations';
import { registryTags } from '@/lib/registry';

export const metadata = { title: 'Registry tags' };
export const dynamic = 'force-dynamic';

const REPO = /^[a-z0-9][a-z0-9._-]{0,39}\/[a-z0-9][a-z0-9._-]{0,39}$/;

export default async function RegistryTagsPage({ params }: { params: Promise<{ repo: string[] }> }) {
  const repo = (await params).repo.join('/');
  if (!REPO.test(repo)) notFound();
  const [tags, user] = await Promise.all([registryTags(repo), currentUser(await headers())]);
  const canManage = user?.role === 'admin';

  return (
    <div className="view-in space-y-7">
      <PageHead
        title={<Code>{repo}</Code>}
        sub={tags === null ? 'Not in the registry' : `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}, newest build first`}
        actions={
          <Link href="/registry" className="text-[14px] text-fg-3 hover:text-fg">
            ← Registry
          </Link>
        }
      />

      {tags === null ? (
        <p className="rounded-xl border border-err/35 bg-err/10 px-5 py-3 text-[14px] text-err">
          The registry does not know this repository, or did not answer.
        </p>
      ) : (
        <Table head={['Tag', 'Digest', 'Size', 'Built', ...(canManage ? [''] : [])]}>
          {tags.map((t) => {
            const alsoTags = tags.filter((o) => o.digest !== null && o.digest === t.digest && o.tag !== t.tag).map((o) => o.tag);
            return (
              <tr key={t.tag}>
                <Td>
                  <Code>{t.tag}</Code>
                </Td>
                <Td className="text-fg-3">
                  <Code>{t.digest ? t.digest.slice(7, 19) : NOT_SET}</Code>
                </Td>
                <Td className="tabular-nums">{t.sizeMb === null ? NOT_SET : size(t.sizeMb)}</Td>
                <Td className="text-fg-3">{t.created ? <LocalTime iso={t.created} /> : NOT_SET}</Td>
                {canManage && (
                  <Td className="text-right">
                    {t.digest && <RegistryTagDelete repo={repo} tag={t.tag} digest={t.digest} alsoTags={alsoTags} />}
                  </Td>
                )}
              </tr>
            );
          })}
          {tags.length === 0 && (
            <tr>
              <Td colSpan={canManage ? 5 : 4} className="text-center text-fg-3">
                No tags.
              </Td>
            </tr>
          )}
        </Table>
      )}
    </div>
  );
}
