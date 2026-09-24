"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiClient, ApiError } from "@/lib/apiClient";
import type { RideRequest } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { StatusStepper } from "./StatusStepper";
import { FareBreakdown } from "./FareBreakdown";

const POLL_INTERVAL_MS = 4000;
const FINAL_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

export function RideDetail({ rideId }: { rideId: string }) {
  const [ride, setRide] = useState<RideRequest | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const inFlight = useRef(false);
  const rideRef = useRef<RideRequest | null>(null);
  useEffect(() => {
    rideRef.current = ride;
  }, [ride]);

  useEffect(() => {
    let cancelled = false;

    async function fetchRide() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const data = await apiClient.get<{ ride: RideRequest }>(`/rides/${rideId}`);
        if (!cancelled) {
          setRide(data.ride);
          setNotFound(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 404) setNotFound(true);
          else if (err.status !== 401) setError(err.message);
        }
      } finally {
        inFlight.current = false;
      }
    }

    void fetchRide();
    const interval = window.setInterval(() => {
      const current = rideRef.current;
      if (current !== null && FINAL_STATUSES.has(current.status)) return;
      void fetchRide();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [rideId]);

  async function handleCancel() {
    setCancelling(true);
    try {
      const data = await apiClient.patch<{ ride: RideRequest }>(`/rides/${rideId}/cancel`, {});
      setRide(data.ride);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.message);
      }
    } finally {
      setCancelling(false);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Ride not found
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          It may have been removed or you may not have access to it.
        </p>
        <div className="mt-6">
          <Link href="/rides">
            <Button variant="secondary">Back to your rides</Button>
          </Link>
        </div>
      </main>
    );
  }

  if (ride === null) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-7 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-64 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-28 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-40 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </main>
    );
  }

  const cancellable = ride.status === "REQUESTED" || ride.status === "MATCHED";
  const final = FINAL_STATUSES.has(ride.status);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/rides"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Back to rides
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {ride.pickupZone.name}
            <span className="mx-2 text-zinc-400">→</span>
            {ride.dropoffZone.name}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Requested {formatDateTime(ride.requestedAt)}
            {!final && ` · refreshing automatically`}
          </p>
        </div>
        <StatusBadge status={ride.status} />
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <StatusStepper status={ride.status} />
      </div>

      <div className="grid gap-6">
        {ride.pool?.tesla ? (
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Your matched Tesla
              </span>
              <p className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {ride.pool.tesla.plateNickname}
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {ride.pool.seatsUsed}/{ride.pool.tesla?.seatCapacity ?? "—"} seats filled
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="h-2.5 w-2.5 animate-ping rounded-full bg-amber-400" />
            Looking for a driver to match your route…
          </div>
        )}

        {ride.fare && <FareBreakdown fare={ride.fare} />}

        {cancellable && (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-300">
              Changed your mind? You can cancel before the ride starts.
            </p>
            <Button variant="danger" onClick={handleCancel} loading={cancelling}>
              Cancel ride
            </Button>
          </div>
        )}

        {ride.fare?.settled && ride.status === "COMPLETED" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            {ride.fare.paidAt
              ? `Paid via Tesla Pay on ${formatDateTime(ride.fare.paidAt)}.`
              : "Please settle your fare with the driver."}
          </div>
        )}
      </div>

      <div className="mt-8">
        <Link href="/rides/new">
          <Button variant="secondary">Request another ride</Button>
        </Link>
      </div>
    </main>
  );
}