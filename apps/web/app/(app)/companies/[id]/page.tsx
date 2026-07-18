import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2Icon, GlobeIcon, PencilIcon, UserIcon, UsersIcon } from 'lucide-react';
import {
  getCompanyContactsPage,
  getCompanyDetailPage,
  getCustomFieldDefinitions,
} from '@verocrest/domain-contacts/server';
import { COMPANY_SIZE_LABELS } from '@verocrest/domain-contacts';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';
import { CompanyActions } from '@/components/companies/company-actions';
import { CompanyArchivedNotice } from '@/components/companies/archived-notice';
import { CustomFieldsDisplay } from '@/components/custom-fields/custom-fields-display';

export const metadata: Metadata = { title: 'Company' };
export const dynamic = 'force-dynamic';

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // getCompanyDetailPage normalizes failures to CompaniesUnavailableError
  // (→ error.tsx); null = not-found in this workspace.
  const company = await getCompanyDetailPage(id);
  if (!company) notFound();
  const contacts = await getCompanyContactsPage(id);
  const definitions = await getCustomFieldDefinitions('company');
  const hasCustomFields = definitions.some(
    (d) =>
      d.fieldKey in company.customFields &&
      company.customFields[d.fieldKey] !== '' &&
      company.customFields[d.fieldKey] != null,
  );

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <CompanyArchivedNotice />

      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Building2Icon className="size-5 text-fg-muted" strokeWidth={1.75} aria-hidden="true" />
            <h1 className="truncate text-xl font-semibold text-fg-strong">{company.name}</h1>
            <Badge variant={company.isClient ? 'success' : 'neutral'}>
              {company.isClient ? 'Client' : 'Prospect'}
            </Badge>
          </div>
          {company.domain ? <p className="mt-0.5 text-sm text-fg-muted">{company.domain}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/companies/${company.id}/edit`}>
            <Button variant="secondary">
              <PencilIcon className="size-4" strokeWidth={1.75} />
              Edit
            </Button>
          </Link>
          <CompanyActions
            companyId={company.id}
            companyName={company.name}
            canMerge={company.viewerIsOwner}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-4">
          <Card>
            <CardBody className="grid grid-cols-2 gap-4">
              <Fact label="Industry" value={company.industry} />
              <Fact label="Size" value={company.size ? COMPANY_SIZE_LABELS[company.size] : null} />
              <Fact
                label="Employees"
                value={company.employeeCount != null ? String(company.employeeCount) : null}
              />
              <div>
                <p className="text-xs text-fg-muted">Website</p>
                {company.websiteUrl ? (
                  <a
                    href={company.websiteUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-0.5 flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover"
                  >
                    <GlobeIcon className="size-3.5" strokeWidth={1.75} />
                    <span className="truncate">Visit</span>
                  </a>
                ) : (
                  <p className="mt-0.5 text-sm text-fg-subtle">—</p>
                )}
              </div>
            </CardBody>
          </Card>

          {company.description ? (
            <Card>
              <CardBody>
                <p className="mb-1 text-xs font-medium text-fg-muted">About</p>
                <p className="whitespace-pre-wrap text-sm text-fg">{company.description}</p>
              </CardBody>
            </Card>
          ) : null}

          {company.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {company.tags.map((t) => (
                <Badge key={t} variant="neutral">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}

          {hasCustomFields ? (
            <Card>
              <CardBody>
                <CustomFieldsDisplay definitions={definitions} values={company.customFields} />
              </CardBody>
            </Card>
          ) : null}

          {/* Surfaces that land in their own sprints (gated placeholders). */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <GatedCard title="Deals" lands="Sprint 10" />
            <GatedCard title="Audits" lands="Sprint 8" />
            <GatedCard title="Activity timeline" lands="a later CRM sprint" />
          </div>
        </div>

        {/* Contacts at this company */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardBody>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                <UsersIcon className="size-3.5" strokeWidth={1.75} /> Contacts (
                {company.contactCount})
              </p>
              {contacts.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-start gap-2">
                      <UserIcon
                        className="mt-0.5 size-3.5 shrink-0 text-fg-subtle"
                        strokeWidth={1.75}
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/contacts/${c.id}`}
                          className="truncate text-sm font-medium text-fg hover:text-primary"
                        >
                          {c.name}
                        </Link>
                        {c.roleTitle ? (
                          <p className="truncate text-xs text-fg-muted">{c.roleTitle}</p>
                        ) : c.email ? (
                          <p className="truncate text-xs text-fg-subtle">{c.email}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-subtle">No contacts linked yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="mt-6 text-xs text-fg-subtle">
        <Link href="/companies" className="hover:text-fg">
          ← Back to companies
        </Link>
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-0.5 text-sm text-fg">{value ?? '—'}</p>
    </div>
  );
}

function GatedCard({ title, lands }: { title: string; lands: string }) {
  return (
    <div className="rounded-md border border-dashed border-edge bg-surface/50 p-3">
      <p className="text-xs font-medium text-fg-muted">{title}</p>
      <p className="mt-0.5 text-xs text-fg-subtle">Lands in {lands}.</p>
    </div>
  );
}
