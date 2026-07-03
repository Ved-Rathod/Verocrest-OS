'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button } from '@verocrest/ui-kit';
import { DeleteContactDialog } from './delete-contact-dialog';

/** Delete action for the contact detail page — on delete, returns to the list. */
export function ContactActions({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-label="Delete contact">
        <Trash2Icon className="size-4" strokeWidth={1.75} />
      </Button>
      <DeleteContactDialog
        target={open ? { id: contactId, name: contactName } : null}
        onClose={() => setOpen(false)}
        onDeleted={() => {
          setOpen(false);
          router.push('/contacts');
          router.refresh();
        }}
      />
    </>
  );
}
