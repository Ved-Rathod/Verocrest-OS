import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getKnowledgeDoc } from '@verocrest/domain-knowledge/server';
import { KbForm } from '@/components/kb/kb-form';
import { loadLinkOptions } from '@/components/kb/link-options';

export const metadata: Metadata = { title: 'Edit document' };
export const dynamic = 'force-dynamic';

export default async function EditKbDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const [doc, links] = await Promise.all([getKnowledgeDoc(ctx, id), loadLinkOptions(ctx)]);
  if (!doc) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Edit document</h1>
        <p className="text-sm text-fg-muted">Editing the content re-indexes AI Memory.</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <KbForm mode="edit" doc={doc} links={links} />
      </div>
    </div>
  );
}
