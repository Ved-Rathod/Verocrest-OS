import { Skeleton } from '@verocrest/ui-kit';

// Route loading state per docs/07 §9.2 — skeleton matches the incoming
// dashboard layout; never a full-page spinner.
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-md border border-edge-subtle bg-surface p-4">
            <Skeleton className="mb-4 h-5 w-40" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-2 h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-16 w-full" />
    </div>
  );
}
