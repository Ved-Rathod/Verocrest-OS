import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { listOffers } from '@verocrest/domain-knowledge/server';
import { Badge, Button } from '@verocrest/ui-kit';

export const metadata: Metadata = { title: 'Offers' };
export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  active: 'success',
  draft: 'neutral',
  paused: 'warning',
  retired: 'neutral',
} as const;

export default async function OffersPage() {
  const ctx = await requireWorkspaceContext();
  const offers = await listOffers(ctx);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-strong">Offer Library</h1>
          <p className="text-sm text-fg-muted">
            What you sell. Active offers are indexed into AI Memory for recommendations.
          </p>
        </div>
        <Link href="/settings/offers/new">
          <Button>New offer</Button>
        </Link>
      </div>

      {offers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge-subtle p-8 text-center text-sm text-fg-muted">
          No offers yet. Create your first productized offer.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {offers.map((offer) => (
            <li key={offer.id}>
              <Link
                href={`/settings/offers/${offer.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge-subtle bg-surface p-4 hover:border-edge"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-fg-strong">{offer.name}</span>
                    <Badge variant={STATUS_VARIANT[offer.status]}>{offer.status}</Badge>
                    <span className="text-xs text-fg-subtle">{offer.pricingModel}</span>
                  </div>
                  {offer.shortDescription ? (
                    <p className="truncate text-sm text-fg-muted">{offer.shortDescription}</p>
                  ) : null}
                </div>
                {offer.status === 'active' ? (
                  <Badge variant={offer.isIndexed ? 'success' : 'warning'}>
                    {offer.isIndexed ? 'Indexed' : 'Indexing…'}
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
