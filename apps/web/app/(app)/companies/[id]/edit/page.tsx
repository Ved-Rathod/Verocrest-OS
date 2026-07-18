import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCompanyById, getCustomFieldDefinitions } from '@verocrest/domain-contacts/server';
import { CompanyForm } from '@/components/companies/company-form';

export const metadata: Metadata = { title: 'Edit company' };
export const dynamic = 'force-dynamic';

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // getCompanyById normalizes failures to CompaniesUnavailableError (→ error.tsx);
  // null = not-found in this workspace.
  const company = await getCompanyById(id);
  if (!company) notFound();
  const definitions = await getCustomFieldDefinitions('company');

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Edit company</h1>
        <p className="text-sm text-fg-muted">
          <Link href={`/companies/${company.id}`} className="hover:text-fg">
            {company.name}
          </Link>
        </p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <CompanyForm
          mode="edit"
          companyId={company.id}
          initial={company}
          definitions={definitions}
        />
      </div>
    </div>
  );
}
