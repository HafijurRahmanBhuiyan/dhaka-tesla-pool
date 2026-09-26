"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/apiClient";
import type { DriverHistoryRide, DriverHistoryResponse } from "@/lib/types";
import { formatDateTime, poyshaToTaka } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "./StatusBadge";

function HistorySkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-xl bg-[var(--muted)]" />
        <div className="h-4 w-72 rounded-lg bg-[var(--muted)]" />
      </div>
      <div className="h-64 rounded-2xl bg-[var(--muted)]" />
    </div>
  );
}

export function DriverRideHistory() {
  const router = useRouter();
  const { authenticated, role, loading: authLoading } = useAuth();
  const [rides, setRides] = useState<DriverHistoryRide[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!authenticated) {
      router.replace("/login");
      return;
    }
    if (role !== "DRIVER") {
      router.replace("/rides");
    }
  }, [authenticated, role, authLoading, router]);

  useEffect(() => {
    if (!authenticated || role !== "DRIVER") return;
    let cancelled = false;
    apiClient
      .get<DriverHistoryResponse>("/driver/rides/history")
      .then((data) => {
        if (!cancelled) {
          setRides(data.rides);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.status !== 401) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, role]);

  if (authLoading || (!authenticated && authLoading)) {
    return <HistorySkeleton />;
  }

  const loading = rides === null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/driver/dashboard"
            className="text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            ← Back to dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Ride History
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Every ride served on your Tesla, including completed and cancelled trips.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-48 rounded-2xl bg-[var(--muted)] animate-pulse" />
      ) : rides.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--muted)] text-[var(--muted-foreground)]">
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            No past rides yet.
          </h3>
          <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">
            Rides you serve on your Tesla will appear here once passengers start booking.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rides.map((ride) => {
            const terminal = ride.status === "COMPLETED" || ride.status === "CANCELLED";
            return (
              <div
                key={ride.id}
                className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--foreground)]">
                        {ride.passenger.name}
                      </p>
                      {ride.seatsRequested > 1 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          {ride.seatsRequested} seats
                        </span>
                      )}
                      <StatusBadge status={ride.status} />
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      📞 {ride.passenger.phone} · Requested {formatDateTime(ride.requestedAt)}
                    </p>
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        📍 {ride.pickupZone.name}
                      </span>
                      <span className="text-[var(--muted-foreground)]">→</span>
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        🏁 {ride.dropoffZone.name}
                      </span>
                    </div>
                    {ride.pool && (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        ⚡ {ride.pool.tesla.plateNickname} · Pool #{ride.pool.id}
                      </p>
                    )}
                    {ride.status === "CANCELLED" && ride.cancellationReason && (
                      <p className="text-xs font-medium text-red-600 dark:text-red-400">
                        {ride.cancelledBy === "DRIVER"
                          ? `Cancelled by you: ${ride.cancellationReason}.`
                          : `Cancelled by passenger: ${ride.cancellationReason}.`}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {ride.fare ? (
                      <>
                        <p className="text-lg font-bold tabular-nums text-[var(--foreground)]">
                          {poyshaToTaka(ride.fare.totalFarePoysha)}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {ride.fare.settled ? "Settled" : terminal ? "Unsettled" : "Estimate"}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm italic text-[var(--muted-foreground)]">
                        No fare
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}