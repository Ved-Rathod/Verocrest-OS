import type { Metadata } from 'next';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { listIcps } from '@verocrest/domain-knowledge/server';
import { OfferForm } from '@/components/offers/offer-form';

export const metadata: Metadata = { title: 'New offer' };
export const dynamic = 'force-dynamic';

export default async function NewOfferPage() {
  const ctx = await requireWorkspaceContext();
  const icps = (await listIcps(ctx)).map((i) => ({ id: i.id, name: i.name }));

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">New offer</h1>
        <p className="text-sm text-fg-muted">Productize what you sell.</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <OfferForm mode="create" icps={icps} />
      </div>
    </div>
  );
}
