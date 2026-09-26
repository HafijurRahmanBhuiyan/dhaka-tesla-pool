import type { RideStatus } from "@/lib/types";

const LABELS: Record<RideStatus, string> = {
  REQUESTED: "Requested",
  MATCHED: "Matched",
  DRIVER_ARRIVED: "Driver arrived",
  STARTED: "In transit",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const CLASSES: Record<RideStatus, string> = {
  REQUESTED:
    "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300",
  MATCHED: "bg-blue-100 text-blue-700 ring-blue-500/25 dark:bg-blue-900/40 dark:text-blue-300",
  DRIVER_ARRIVED:
    "bg-amber-100 text-amber-700 ring-amber-500/25 dark:bg-amber-900/40 dark:text-amber-300",
  STARTED: "bg-violet-100 text-violet-700 ring-violet-500/25 dark:bg-violet-900/40 dark:text-violet-300",
  COMPLETED:
    "bg-emerald-100 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-700 ring-red-500/25 dark:bg-red-900/40 dark:text-red-300",
};

const DOTS: Record<RideStatus, string> = {
  REQUESTED: "bg-zinc-400 dark:bg-zinc-500",
  MATCHED: "bg-blue-500",
  DRIVER_ARRIVED: "bg-amber-500",
  STARTED: "bg-violet-500",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-red-500",
};

export function statusLabel(status: RideStatus): string {
  return LABELS[status];
}

export function StatusBadge({ status }: { status: RideStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${CLASSES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}