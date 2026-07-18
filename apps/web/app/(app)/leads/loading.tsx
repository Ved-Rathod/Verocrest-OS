import { Skeleton } from '@verocrest/ui-kit';

export default function LeadsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="mb-4 h-9 w-full" />
      <div className="overflow-hidden rounded-md border border-edge-subtle">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-edge-subtle px-3 py-3 last:border-0"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
