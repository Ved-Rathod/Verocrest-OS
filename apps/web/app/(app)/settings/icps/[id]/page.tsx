import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PencilIcon } from 'lucide-react';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getIcp } from '@verocrest/domain-knowledge/server';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';

export const metadata: Metadata = { title: 'ICP' };
export const dynamic = 'force-dynamic';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-0.5 text-sm text-fg">{value || '—'}</p>
    </div>
  );
}

export default async function IcpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const icp = await getIcp(ctx, id);
  if (!icp) notFound();

  const revenue =
    icp.targetRevenueMin != null || icp.targetRevenueMax != null
      ? `${icp.targetRevenueMin ?? '—'} to ${icp.targetRevenueMax ?? '—'} ${icp.targetRevenueCurrency ?? ''}`.trim()
      : '';

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-fg-strong">{icp.name}</h1>
            {icp.isPrimary ? <Badge variant="info">Primary</Badge> : null}
            <Badge variant={icp.isIndexed ? 'success' : 'warning'}>
              {icp.isIndexed ? 'Indexed' : 'Indexing…'}
            </Badge>
          </div>
          {icp.shortDescription ? (
            <p className="mt-1 text-sm text-fg-muted">{icp.shortDescription}</p>
          ) : null}
        </div>
        <Link href={`/settings/icps/${icp.id}/edit`}>
          <Button variant="secondary">
            <PencilIcon className="size-4" strokeWidth={1.75} />
            Edit
          </Button>
        </Link>
      </div>

      <Card>
        <CardBody>
          <p className="mb-1 text-xs font-medium text-fg-muted">Narrative</p>
          <p className="whitespace-pre-wrap text-sm text-fg">{icp.narrative}</p>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Target industries" value={icp.targetIndustries.join(', ')} />
          <Field label="Target geographies" value={icp.targetGeographies.join(', ')} />
          <Field label="Target size" value={icp.targetSize.join(', ')} />
          <Field label="Revenue range" value={revenue} />
          <Field label="Disqualifiers" value={icp.disqualifiers.join(', ')} />
        </CardBody>
      </Card>

      <p className="mt-6 text-xs text-fg-subtle">
        <Link href="/settings/icps" className="hover:text-fg">
          ← Back to ICPs
        </Link>
      </p>
    </div>
  );
}
