import type { Metadata } from 'next';
import { IcpForm } from '@/components/icps/icp-form';

export const metadata: Metadata = { title: 'New ICP' };
export const dynamic = 'force-dynamic';

export default function NewIcpPage() {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">New ICP</h1>
        <p className="text-sm text-fg-muted">Describe an ideal customer profile.</p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <IcpForm mode="create" />
      </div>
    </div>
  );
}
