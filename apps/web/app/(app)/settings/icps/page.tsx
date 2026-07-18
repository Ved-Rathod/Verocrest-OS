import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { listIcps } from '@verocrest/domain-knowledge/server';
import { Badge, Button } from '@verocrest/ui-kit';

export const metadata: Metadata = { title: 'ICPs' };
export const dynamic = 'force-dynamic';

export default async function IcpsPage() {
  const ctx = await requireWorkspaceContext();
  const icps = await listIcps(ctx);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-strong">Ideal Customer Profiles</h1>
          <p className="text-sm text-fg-muted">
            Define who you sell to. The narrative feeds AI Memory and powers lead scoring.
          </p>
        </div>
        <Link href="/settings/icps/new">
          <Button>New ICP</Button>
        </Link>
      </div>

      {icps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge-subtle p-8 text-center text-sm text-fg-muted">
          No ICPs yet. Create your first to warm up AI Memory.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {icps.map((icp) => (
            <li key={icp.id}>
              <Link
                href={`/settings/icps/${icp.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge-subtle bg-surface p-4 hover:border-edge"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-fg-strong">{icp.name}</span>
                    {icp.isPrimary ? <Badge variant="info">Primary</Badge> : null}
                    {icp.active ? null : <Badge variant="neutral">Inactive</Badge>}
                  </div>
                  {icp.shortDescription ? (
                    <p className="truncate text-sm text-fg-muted">{icp.shortDescription}</p>
                  ) : null}
                </div>
                <Badge variant={icp.isIndexed ? 'success' : 'warning'}>
                  {icp.isIndexed ? 'Indexed' : 'Indexing…'}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
