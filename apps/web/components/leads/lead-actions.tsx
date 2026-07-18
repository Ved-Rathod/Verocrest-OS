'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button } from '@verocrest/ui-kit';
import { DeleteLeadDialog } from './delete-lead-dialog';

/** Archive action for the lead detail page — returns to the list on success. */
export function LeadActions({ leadId, contactName }: { leadId: string; contactName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-label="Archive lead">
        <Trash2Icon className="size-4" strokeWidth={1.75} />
      </Button>
      <DeleteLeadDialog
        target={open ? { id: leadId, name: contactName } : null}
        onClose={() => setOpen(false)}
        // The ACTION redirects server-side (redirect + replace) — a client-side
        // replace can never win: revalidatePath re-renders the deleted detail
        // route into a 404 in the same action response, unmounting this
        // component before the effect runs (Sprint 2.4 QA fix, mirrors
        // ReminderActions). onDeleted is a defensive fallback only.
        redirectTo="/leads?archived=1"
        onDeleted={() => {
          setOpen(false);
          router.replace('/leads?archived=1');
        }}
      />
    </>
  );
}
