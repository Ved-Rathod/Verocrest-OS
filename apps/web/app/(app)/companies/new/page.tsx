import type { Metadata } from 'next';
import { getCustomFieldDefinitions } from '@verocrest/domain-contacts/server';
import { CompanyForm } from '@/components/companies/company-form';

export const metadata: Metadata = { title: 'New company' };
export const dynamic = 'force-dynamic';

export default async function NewCompanyPage() {
  const definitions = await getCustomFieldDefinitions('company');

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">New company</h1>
        <p className="text-sm text-fg-muted">Add an organization you sell to.</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <CompanyForm mode="create" definitions={definitions} />
      </div>
    </div>
  );
}
