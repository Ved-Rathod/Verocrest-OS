import type { Metadata } from 'next';
import { LeadForm } from '@/components/leads/lead-form';

export const metadata: Metadata = { title: 'New lead' };

export default function NewLeadPage() {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">New lead</h1>
        <p className="text-sm text-fg-muted">
          Pick the contact you&apos;re pursuing — or create them inline.
        </p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <LeadForm mode="create" />
      </div>
    </div>
  );
}
