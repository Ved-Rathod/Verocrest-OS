import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PencilIcon } from 'lucide-react';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getOffer } from '@verocrest/domain-knowledge/server';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';

export const metadata: Metadata = { title: 'Offer' };
export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  active: 'success',
  draft: 'neutral',
  paused: 'warning',
  retired: 'neutral',
} as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{value || '—'}</p>
    </div>
  );
}

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const offer = await getOffer(ctx, id);
  if (!offer) notFound();

  const price =
    offer.price != null || offer.priceMax != null
      ? `${offer.price ?? '—'}${offer.priceMax != null ? `–${offer.priceMax}` : ''} ${offer.currency ?? ''}`.trim()
      : '';

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-fg-strong">{offer.name}</h1>
            <Badge variant={STATUS_VARIANT[offer.status]}>{offer.status}</Badge>
            {offer.status === 'active' ? (
              <Badge variant={offer.isIndexed ? 'success' : 'warning'}>
                {offer.isIndexed ? 'Indexed' : 'Indexing…'}
              </Badge>
            ) : null}
          </div>
          {offer.shortDescription ? (
            <p className="mt-1 text-sm text-fg-muted">{offer.shortDescription}</p>
          ) : null}
        </div>
        <Link href={`/settings/offers/${offer.id}/edit`}>
          <Button variant="secondary">
            <PencilIcon className="size-4" strokeWidth={1.75} />
            Edit
          </Button>
        </Link>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Pricing"
            value={`${offer.pricingModel}${price ? ` · ${price}` : ''}${offer.billingCadence ? ` · ${offer.billingCadence}` : ''}`}
          />
          <Field label="Target industries" value={offer.targetIndustries.join(', ')} />
          <Field label="Positioning" value={offer.positioning ?? ''} />
          <Field label="ROI narrative" value={offer.roiNarrative ?? ''} />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody className="flex flex-col gap-3 text-sm text-fg">
          <p className="text-xs font-medium text-fg-muted">Deliverables</p>
          {offer.deliverables.length === 0 ? (
            <p className="text-fg-muted">—</p>
          ) : (
            <ul className="list-disc pl-5">
              {offer.deliverables.map((d, i) => (
                <li key={i}>
                  <span className="font-medium">{d.title}</span>
                  {d.description ? ` — ${d.description}` : ''}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs font-medium text-fg-muted">Guarantees</p>
          {offer.guarantees.length === 0 ? (
            <p className="text-fg-muted">—</p>
          ) : (
            <ul className="list-disc pl-5">
              {offer.guarantees.map((g, i) => (
                <li key={i}>
                  <span className="font-medium">{g.type}</span>
                  {g.description ? ` — ${g.description}` : ''}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="mt-6 text-xs text-fg-subtle">
        <Link href="/settings/offers" className="hover:text-fg">
          ← Back to offers
        </Link>
      </p>
    </div>
  );
}
