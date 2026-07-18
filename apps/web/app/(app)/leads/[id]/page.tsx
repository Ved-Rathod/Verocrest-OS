import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2Icon, CalendarIcon, PencilIcon, TagIcon, UserIcon } from 'lucide-react';
import { getLeadDetailPage } from '@verocrest/domain-leads/server';
import { LEAD_PRIORITY_LABELS, LEAD_STATUS_LABELS, leadContactName } from '@verocrest/domain-leads';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';
import { LeadActions } from '@/components/leads/lead-actions';
import { formatMoney, priorityVariant, statusVariant } from '@/components/leads/lead-format';

export const metadata: Metadata = { title: 'Lead' };
export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // getLeadDetailPage normalizes failures to LeadsUnavailableError (→ error.tsx);
  // a null result means not-found in this workspace.
  const lead = await getLeadDetailPage(id);
  if (!lead) notFound();

  const name = leadContactName(lead.contact);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-fg-strong">{name}</h1>
            <Badge variant={statusVariant(lead.status)}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
            {lead.priority ? (
              <Badge variant={priorityVariant(lead.priority)}>
                {LEAD_PRIORITY_LABELS[lead.priority]} priority
              </Badge>
            ) : null}
          </div>
          {lead.source ? (
            <p className="mt-0.5 text-sm text-fg-muted">Source: {lead.source}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/leads/${lead.id}/edit`}>
            <Button variant="secondary">
              <PencilIcon className="size-4" strokeWidth={1.75} />
              Edit
            </Button>
          </Link>
          <LeadActions leadId={lead.id} contactName={name} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Main */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <Card>
            <CardBody className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-fg-muted">Estimated value</p>
                <p className="mt-0.5 font-mono text-lg text-fg-strong">
                  {formatMoney(lead.estimatedValue, lead.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-muted">Expected close</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-fg">
                  <CalendarIcon className="size-4 text-fg-subtle" strokeWidth={1.75} />
                  {lead.expectedCloseDate ?? '—'}
                </p>
              </div>
            </CardBody>
          </Card>

          {lead.status === 'disqualified' && lead.disqualifiedReason ? (
            <Card>
              <CardBody>
                <p className="mb-1 text-xs font-medium text-danger">Disqualified</p>
                <p className="text-sm text-fg">{lead.disqualifiedReason}</p>
              </CardBody>
            </Card>
          ) : null}

          {lead.notes ? (
            <Card>
              <CardBody>
                <p className="mb-1 text-xs font-medium text-fg-muted">Notes</p>
                <p className="whitespace-pre-wrap text-sm text-fg">{lead.notes}</p>
              </CardBody>
            </Card>
          ) : null}

          {lead.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <TagIcon className="size-3.5 text-fg-subtle" strokeWidth={1.75} />
              {lead.tags.map((t) => (
                <Badge key={t} variant="neutral">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        {/* Relationship panels */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardBody>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                <UserIcon className="size-3.5" strokeWidth={1.75} /> Contact
              </p>
              <div className="flex flex-col gap-1">
                <Link
                  href={`/contacts/${lead.contact.id}`}
                  className="font-medium text-fg hover:text-primary"
                >
                  {name}
                </Link>
                {lead.contact.primaryEmail ? (
                  <span className="truncate text-xs text-fg-muted">
                    {lead.contact.primaryEmail}
                  </span>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                <Building2Icon className="size-3.5" strokeWidth={1.75} /> Company
              </p>
              {lead.company ? (
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/companies/${lead.company.id}/edit`}
                    className="font-medium text-fg hover:text-primary"
                  >
                    {lead.company.name}
                  </Link>
                  {lead.company.domain ? (
                    <span className="text-xs text-fg-muted">{lead.company.domain}</span>
                  ) : null}
                </div>
              ) : lead.contact.companyName ? (
                <span className="text-sm text-fg">{lead.contact.companyName}</span>
              ) : (
                <span className="text-sm text-fg-subtle">Derived from the contact — none set</span>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="mt-6 text-xs text-fg-subtle">
        <Link href="/leads" className="hover:text-fg">
          ← Back to leads
        </Link>
      </p>
    </div>
  );
}
