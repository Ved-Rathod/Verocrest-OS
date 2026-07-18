import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PencilIcon } from 'lucide-react';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getKnowledgeDoc } from '@verocrest/domain-knowledge/server';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';

export const metadata: Metadata = { title: 'Document' };
export const dynamic = 'force-dynamic';

export default async function KbDocDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const doc = await getKnowledgeDoc(ctx, id);
  if (!doc) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-fg-strong">{doc.title}</h1>
            <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted">
              {doc.docType}
            </span>
            <Badge variant={doc.isIndexed ? 'success' : 'warning'}>
              {doc.isIndexed ? 'Indexed' : 'Indexing…'}
            </Badge>
          </div>
          {doc.tags.length > 0 ? (
            <p className="mt-1 text-xs text-fg-subtle">{doc.tags.join(', ')}</p>
          ) : null}
        </div>
        <Link href={`/kb/${doc.id}/edit`}>
          <Button variant="secondary">
            <PencilIcon className="size-4" strokeWidth={1.75} />
            Edit
          </Button>
        </Link>
      </div>

      <Card>
        <CardBody>
          <p className="whitespace-pre-wrap text-sm text-fg">{doc.content}</p>
        </CardBody>
      </Card>

      <p className="mt-6 text-xs text-fg-subtle">
        <Link href="/kb" className="hover:text-fg">
          ← Back to Knowledge Base
        </Link>
      </p>
    </div>
  );
}
