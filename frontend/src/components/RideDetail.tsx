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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
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

  async function handleCancel(reason?: string) {
    setCancelling(true);
    try {
      const data = await apiClient.patch<{ ride: RideRequest }>(
        `/rides/${rideId}/cancel`,
        reason ? { reason } : {},
      );
      setRide(data.ride);
      setShowCancelConfirm(false);
      setCancelReason("");
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

  const cancellable =
    ride.status === "REQUESTED" ||
    ride.status === "MATCHED" ||
    ride.status === "DRIVER_ARRIVED";
  const final = FINAL_STATUSES.has(ride.status);
  const showFeeWarning = ride.status === "DRIVER_ARRIVED";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
      <div className="mb-6">
        <Link
          href="/rides"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to My Rides
        </Link>

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
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
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {ride.status === "CANCELLED" && ride.cancelledBy === "DRIVER" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span className="font-semibold">Cancelled by the driver.</span>{" "}
          {ride.cancellationReason
            ? `Reason: ${ride.cancellationReason}.`
            : "No reason was given."}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <StatusStepper status={ride.status} />
      </div>

      <div className="grid gap-6">
        {ride.pool?.tesla ? (
          <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13 2L4.09 12.97 11.5 12l-1.5 9 8.91-10.97H11.5L13 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Your matched Tesla
                </span>
                <p className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {ride.pool.tesla.plateNickname}
                </p>
                {ride.pool.tesla.driver && (
                  <p className="mt-0.5 break-words text-xs text-zinc-500 dark:text-zinc-400">
                    {ride.pool.tesla.driver.name} · 📞 {ride.pool.tesla.driver.phone}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Your booking: {ride.seatsRequested}{" "}
                  {ride.seatsRequested === 1 ? "seat" : "seats"} · {ride.pool.seatsUsed}/
                  {ride.pool.tesla?.seatCapacity ?? "—"} seats filled
                </p>
              </div>
            </div>
            {ride.pool.tesla.driver && (
              <a
                href={`tel:${ride.pool.tesla.driver.phone}`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
                Call driver
              </a>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="h-2.5 w-2.5 animate-ping rounded-full bg-amber-400" />
            Looking for a driver to match your route…
          </div>
        )}

        {ride.fare && <FareBreakdown fare={ride.fare} />}

        {cancellable &&
          (showFeeWarning && showCancelConfirm ? (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-4 dark:border-red-900 dark:bg-red-950">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Cancelling now may incur a 10 Tk fee.
              </p>
              <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">
                Your driver has already arrived. Are you sure you want to cancel this ride?
              </p>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (optional)"
                disabled={cancelling}
                className="mt-3 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20 disabled:opacity-60 dark:border-red-900 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  loading={cancelling}
                  onClick={() => void handleCancel(cancelReason.trim() || undefined)}
                >
                  {cancelling ? "Cancelling…" : "Confirm cancellation"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={cancelling}
                  onClick={() => {
                    setShowCancelConfirm(false);
                    setCancelReason("");
                  }}
                >
                  Keep ride
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-900 dark:bg-red-950">
              <p className="text-sm text-red-700 dark:text-red-300">
                {showFeeWarning
                  ? "Your driver is here. Cancelling now may incur a 10 Tk fee."
                  : "Changed your mind? You can cancel before the ride starts."}
              </p>
              <Button
                variant="danger"
                onClick={() =>
                  showFeeWarning
                    ? setShowCancelConfirm(true)
                    : void handleCancel()
                }
                loading={cancelling}
                className="self-start sm:self-auto"
              >
                Cancel ride
              </Button>
            </div>
          ))}

        {ride.fare?.settled && ride.status === "COMPLETED" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            {ride.fare.paidAt
              ? `Paid via Tesla Pay on ${formatDateTime(ride.fare.paidAt)}.`
              : "Settled in cash with the driver."}
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