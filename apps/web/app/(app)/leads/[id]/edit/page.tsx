import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLeadDetailPage } from '@verocrest/domain-leads/server';
import { leadContactName } from '@verocrest/domain-leads';
import { LeadForm } from '@/components/leads/lead-form';

export const metadata: Metadata = { title: 'Edit lead' };
export const dynamic = 'force-dynamic';

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Failures normalize to LeadsUnavailableError (→ error.tsx); null = not-found.
  const lead = await getLeadDetailPage(id);
  if (!lead) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Edit lead</h1>
        <p className="text-sm text-fg-muted">{leadContactName(lead.contact)}</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <LeadForm mode="edit" leadId={lead.id} initial={lead} />
      </div>
    </div>
  );
}
