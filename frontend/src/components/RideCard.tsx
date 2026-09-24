import Link from "next/link";
import type { RideRequest } from "@/lib/types";
import { formatDateTime, poyshaToTaka } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

export function RideCard({ ride }: { ride: RideRequest }) {
  const isCancelled = ride.status === "CANCELLED";
  return (
    <Link
      href={`/rides/${ride.id}`}
      className="group block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-100">
            {ride.pickupZone.name}
            <span className="mx-1.5 text-zinc-400">→</span>
            {ride.dropoffZone.name}
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {formatDateTime(ride.requestedAt)}
          </p>
        </div>
        <StatusBadge status={ride.status} />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">
          {ride.pool?.tesla?.plateNickname ?? "Waiting for a match"}
        </span>
        {ride.fare && !isCancelled ? (
          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {poyshaToTaka(ride.fare.totalFarePoysha)}
          </span>
        ) : isCancelled ? (
          <span className="text-zinc-400 dark:text-zinc-600">Cancelled</span>
        ) : (
          <span className="animate-pulse text-zinc-400 dark:text-zinc-500">Calculating…</span>
        )}
      </div>
    </Link>
  );
}