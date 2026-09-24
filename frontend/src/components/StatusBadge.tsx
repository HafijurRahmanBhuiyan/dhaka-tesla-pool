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
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  MATCHED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  DRIVER_ARRIVED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  STARTED: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function statusLabel(status: RideStatus): string {
  return LABELS[status];
}

export function StatusBadge({ status }: { status: RideStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASSES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}