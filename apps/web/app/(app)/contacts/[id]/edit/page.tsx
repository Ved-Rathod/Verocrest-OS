import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getContactDetailPage, getCustomFieldDefinitions } from '@verocrest/domain-contacts/server';
import { displayName } from '@verocrest/domain-contacts';
import { ContactForm } from '@/components/contacts/contact-form';

export const metadata: Metadata = { title: 'Edit contact' };
export const dynamic = 'force-dynamic';

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // getContactDetailPage normalizes failures (→ error.tsx); null = not-found.
  const contact = await getContactDetailPage(id);
  if (!contact) notFound();
  const definitions = await getCustomFieldDefinitions('contact');

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Edit contact</h1>
        <p className="text-sm text-fg-muted">{displayName(contact)}</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <ContactForm
          mode="edit"
          contactId={contact.id}
          initial={contact}
          definitions={definitions}
        />
      </div>
    </div>
  );
}
