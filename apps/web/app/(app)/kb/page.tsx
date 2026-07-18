import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { listKnowledgeDocs } from '@verocrest/domain-knowledge/server';
import { Badge, Button } from '@verocrest/ui-kit';

export const metadata: Metadata = { title: 'Knowledge Base' };
export const dynamic = 'force-dynamic';

export default async function KbPage() {
  const ctx = await requireWorkspaceContext();
  const docs = await listKnowledgeDocs(ctx);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-strong">Knowledge Base</h1>
          <p className="text-sm text-fg-muted">
            SOPs, case studies, testimonials and playbooks. Indexed into AI Memory for drafting.
          </p>
        </div>
        <Link href="/kb/new">
          <Button>New document</Button>
        </Link>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge-subtle p-8 text-center text-sm text-fg-muted">
          No documents yet. Add your first knowledge document.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/kb/${doc.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge-subtle bg-surface p-4 hover:border-edge"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-fg-strong">{doc.title}</span>
                    <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted">
                      {doc.docType}
                    </span>
                  </div>
                  {doc.tags.length > 0 ? (
                    <p className="truncate text-xs text-fg-subtle">{doc.tags.join(', ')}</p>
                  ) : null}
                </div>
                <Badge variant={doc.isIndexed ? 'success' : 'warning'}>
                  {doc.isIndexed ? 'Indexed' : 'Indexing…'}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
