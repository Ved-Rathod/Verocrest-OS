import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getIcp } from '@verocrest/domain-knowledge/server';
import { IcpForm } from '@/components/icps/icp-form';

export const metadata: Metadata = { title: 'Edit ICP' };
export const dynamic = 'force-dynamic';

export default async function EditIcpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const icp = await getIcp(ctx, id);
  if (!icp) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Edit ICP</h1>
        <p className="text-sm text-fg-muted">Editing the narrative re-indexes AI Memory.</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <IcpForm mode="edit" icp={icp} />
      </div>
    </div>
  );
}
