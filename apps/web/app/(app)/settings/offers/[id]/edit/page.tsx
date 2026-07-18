import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getOffer, listIcps } from '@verocrest/domain-knowledge/server';
import { OfferForm } from '@/components/offers/offer-form';

export const metadata: Metadata = { title: 'Edit offer' };
export const dynamic = 'force-dynamic';

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const [offer, icpList] = await Promise.all([getOffer(ctx, id), listIcps(ctx)]);
  if (!offer) notFound();
  const icps = icpList.map((i) => ({ id: i.id, name: i.name }));

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Edit offer</h1>
        <p className="text-sm text-fg-muted">Editing positioning or ROI re-indexes AI Memory.</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <OfferForm mode="edit" offer={offer} icps={icps} />
      </div>
    </div>
  );
}
