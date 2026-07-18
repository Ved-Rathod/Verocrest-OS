import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2Icon, ExternalLinkIcon, MailIcon, PencilIcon, PhoneIcon } from 'lucide-react';
import { getContactDetailPage, getCustomFieldDefinitions } from '@verocrest/domain-contacts/server';
import { SENIORITY_LABELS, displayName } from '@verocrest/domain-contacts';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';
import { ContactActions } from '@/components/contacts/contact-actions';
import { CustomFieldsDisplay } from '@/components/custom-fields/custom-fields-display';

export const metadata: Metadata = { title: 'Contact' };
export const dynamic = 'force-dynamic';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // getContactDetailPage normalizes failures (→ error.tsx); null = not-found.
  const contact = await getContactDetailPage(id);
  if (!contact) notFound();
  const definitions = await getCustomFieldDefinitions('contact');
  const hasCustomFields = definitions.some(
    (d) =>
      d.fieldKey in contact.customFields &&
      contact.customFields[d.fieldKey] !== '' &&
      contact.customFields[d.fieldKey] != null,
  );

  const name = displayName(contact);
  const phone = contact.phones[0]?.number ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-fg-strong">{name}</h1>
            {contact.isClient ? (
              <Badge variant="success">Client</Badge>
            ) : (
              <Badge variant="neutral">Prospect</Badge>
            )}
            {contact.isDecisionMaker ? <Badge variant="info">Decision maker</Badge> : null}
          </div>
          {contact.roleTitle || contact.seniority ? (
            <p className="mt-0.5 text-sm text-fg-muted">
              {[contact.roleTitle, contact.seniority ? SENIORITY_LABELS[contact.seniority] : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/contacts/${contact.id}/edit`}>
            <Button variant="secondary">
              <PencilIcon className="size-4" strokeWidth={1.75} />
              Edit
            </Button>
          </Link>
          <ContactActions contactId={contact.id} contactName={name} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Main */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <DetailRow icon={MailIcon} label="Email">
                {contact.primaryEmail ? (
                  <a
                    href={`mailto:${contact.primaryEmail}`}
                    className="text-primary hover:underline"
                  >
                    {contact.primaryEmail}
                  </a>
                ) : (
                  <span className="text-fg-subtle">—</span>
                )}
              </DetailRow>
              <DetailRow icon={PhoneIcon} label="Phone">
                {phone ?? <span className="text-fg-subtle">—</span>}
              </DetailRow>
              {contact.linkedinUrl ? (
                <DetailRow icon={ExternalLinkIcon} label="LinkedIn">
                  <a
                    href={contact.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {contact.linkedinUrl}
                  </a>
                </DetailRow>
              ) : null}
              {contact.websiteUrl ? (
                <DetailRow icon={ExternalLinkIcon} label="Website">
                  <a
                    href={contact.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {contact.websiteUrl}
                  </a>
                </DetailRow>
              ) : null}
            </CardBody>
          </Card>

          {contact.notes ? (
            <Card>
              <CardBody>
                <p className="mb-1 text-xs font-medium text-fg-muted">Notes</p>
                <p className="whitespace-pre-wrap text-sm text-fg">{contact.notes}</p>
              </CardBody>
            </Card>
          ) : null}

          {contact.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((t) => (
                <Badge key={t} variant="neutral">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}

          {hasCustomFields ? (
            <Card>
              <CardBody>
                <CustomFieldsDisplay definitions={definitions} values={contact.customFields} />
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* Company panel (relationship display, docs/06 §3) */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardBody>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                <Building2Icon className="size-3.5" strokeWidth={1.75} /> Company
              </p>
              {contact.company ? (
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/companies/${contact.company.id}/edit`}
                    className="font-medium text-fg hover:text-primary"
                  >
                    {contact.company.name}
                  </Link>
                  {contact.company.domain ? (
                    <span className="text-xs text-fg-muted">{contact.company.domain}</span>
                  ) : null}
                  {contact.company.industry ? (
                    <span className="text-xs text-fg-muted">{contact.company.industry}</span>
                  ) : null}
                </div>
              ) : contact.companyName ? (
                <span className="text-sm text-fg">{contact.companyName}</span>
              ) : (
                <span className="text-sm text-fg-subtle">Not linked to a company</span>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="mt-6 text-xs text-fg-subtle">
        <Link href="/contacts" className="hover:text-fg">
          ← Back to contacts
        </Link>
      </p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MailIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
      <span className="w-16 shrink-0 text-xs text-fg-muted">{label}</span>
      <span className="min-w-0 truncate text-fg">{children}</span>
    </div>
  );
}
