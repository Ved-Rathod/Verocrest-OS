import { Skeleton } from '@verocrest/ui-kit';

// Route loading state per docs/07 §9.2 — skeleton matches the incoming table.
export default function CompaniesLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="mb-4 h-9 w-full" />
      <div className="overflow-hidden rounded-md border border-edge-subtle">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-edge-subtle px-3 py-3 last:border-0"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
