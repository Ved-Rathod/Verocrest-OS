import type { Metadata } from 'next';
import { getCustomFieldDefinitions } from '@verocrest/domain-contacts/server';
import { ContactForm } from '@/components/contacts/contact-form';

export const metadata: Metadata = { title: 'New contact' };
export const dynamic = 'force-dynamic';

export default async function NewContactPage() {
  const definitions = await getCustomFieldDefinitions('contact');

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">New contact</h1>
        <p className="text-sm text-fg-muted">Add a person you sell to.</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <ContactForm mode="create" definitions={definitions} />
      </div>
    </div>
  );
}
