import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompaniesUnavailableError, getCompanyById } from '@verocrest/domain-contacts/server';
import { CompanyForm } from '@/components/companies/company-form';

export const metadata: Metadata = { title: 'Edit company' };
export const dynamic = 'force-dynamic';

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let company;
  try {
    company = await getCompanyById(id);
  } catch (error) {
    if (error instanceof CompaniesUnavailableError) throw error; // → error.tsx
    throw error;
  }
  if (!company) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Edit company</h1>
        <p className="text-sm text-fg-muted">{company.name}</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <CompanyForm mode="edit" companyId={company.id} initial={company} />
      </div>
    </div>
  );
}
