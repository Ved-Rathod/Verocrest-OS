import type { Metadata } from 'next';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { KbForm } from '@/components/kb/kb-form';
import { loadLinkOptions } from '@/components/kb/link-options';

export const metadata: Metadata = { title: 'New document' };
export const dynamic = 'force-dynamic';

export default async function NewKbDocPage() {
  const ctx = await requireWorkspaceContext();
  const links = await loadLinkOptions(ctx);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">New knowledge document</h1>
        <p className="text-sm text-fg-muted">Markdown content is indexed into AI Memory.</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <KbForm mode="create" links={links} />
      </div>
    </div>
  );
}
