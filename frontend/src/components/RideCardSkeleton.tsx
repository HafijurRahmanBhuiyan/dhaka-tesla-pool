export function RideCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
        <div className="h-5 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-3 w-28 rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-3 w-12 rounded bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </div>
  );
}