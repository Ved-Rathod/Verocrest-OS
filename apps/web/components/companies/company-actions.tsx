'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GitMergeIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@verocrest/ui-kit';
import { DeleteCompanyDialog } from './delete-company-dialog';
import { MergeCompanyDialog } from './merge-company-dialog';

/** Company detail actions: Merge (owner-only) + Archive. Edit lives in the header. */
export function CompanyActions({
  companyId,
  companyName,
  canMerge,
}: {
  companyId: string;
  companyName: string;
  canMerge: boolean;
}) {
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  return (
    <>
      {canMerge ? (
        <Button variant="secondary" onClick={() => setMergeOpen(true)}>
          <GitMergeIcon className="size-4" strokeWidth={1.75} />
          Merge
        </Button>
      ) : null}
      <Button variant="ghost" aria-label="Archive company" onClick={() => setArchiveOpen(true)}>
        <Trash2Icon className="size-4" strokeWidth={1.75} />
      </Button>

      <MergeCompanyDialog
        source={mergeOpen ? { id: companyId, name: companyName } : null}
        onClose={() => setMergeOpen(false)}
      />

      <DeleteCompanyDialog
        target={archiveOpen ? { id: companyId, name: companyName } : null}
        onClose={() => setArchiveOpen(false)}
        // The action redirects server-side (redirect + replace); the client
        // fallback below is unreachable while redirectTo is passed.
        redirectTo="/companies?archived=1"
        onDeleted={() => {
          setArchiveOpen(false);
          router.replace('/companies?archived=1');
        }}
      />
    </>
  );
}
