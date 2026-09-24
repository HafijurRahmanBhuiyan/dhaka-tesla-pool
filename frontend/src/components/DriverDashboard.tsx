"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient, ApiError, toastBus } from "@/lib/apiClient";
import type { ActivePoolsResponse, DriverPool, RideStatus, Role } from "@/lib/types";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { FareBreakdown } from "./FareBreakdown";

const ADVANCE_LABELS: Partial<Record<RideStatus, string>> = {
  MATCHED: "Mark arrived",
  DRIVER_ARRIVED: "Start ride",
  STARTED: "Complete ride",
};

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-64 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

export function DriverDashboard() {
  const router = useRouter();
  const [phase, setPhase] = useState<"auth" | "data">("auth");
  const [pools, setPools] = useState<DriverPool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; role?: Role }) => {
        if (cancelled) return;
        if (!data?.authenticated) {
          router.replace("/login");
          return;
        }
        if (data.role !== "DRIVER") {
          router.push("/rides");
          return;
        }
        setPhase("data");
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (phase !== "data") return;
    let cancelled = false;
    apiClient
      .get<ActivePoolsResponse>("/driver/pools/active")
      .then((data) => {
        if (!cancelled) {
          setPools(data.pools);
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
  }, [phase]);

  async function refreshPools() {
    try {
      const data = await apiClient.get<ActivePoolsResponse>("/driver/pools/active");
      setPools(data.pools);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.message);
      }
    }
  }

  async function handleAdvance(poolId: number) {
    setAdvancing(true);
    try {
      await apiClient.patch<{ pool: DriverPool }>(`/driver/pools/${poolId}/advance`, {});
      toastBus.emit("Pool updated.", "success");
      await refreshPools();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toastBus.emit(err.message);
        await refreshPools();
      }
    } finally {
      setAdvancing(false);
    }
  }

  const pool = pools?.[0] ?? null;
  const hasPassengers = pool !== null && pool.rideRequests.length > 0;
  const advanceLabel = pool ? (ADVANCE_LABELS[pool.status] ?? "Advance pool") : "Advance pool";
  const advanceDisabled = pool === null || !hasPassengers;
  const advanceTitle =
    pool === null
      ? "No active pool right now — waiting for riders to match your route."
      : "This pool has no passengers yet.";

  if (phase === "auth") {
    return <DashboardSkeleton />;
  }

  const loadingPools = pools === null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="mb-6 grid gap-3 sm:flex sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Driver dashboard
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Manage the pool ride currently assigned to your Tesla.
          </p>
        </div>
        <Button
          title={advanceTitle}
          disabled={advanceDisabled || loadingPools}
          loading={advancing}
          onClick={() => {
            if (pool) void handleAdvance(pool.id);
          }}
        >
          {advanceLabel}
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {loadingPools ? (
        <DashboardSkeleton />
      ) : pool === null ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <svg
            className="h-12 w-12 text-zinc-300 dark:text-zinc-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
            />
          </svg>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            No active pool right now
          </h2>
          <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            When a passenger&apos;s ride request matches your route, the pool will
            appear here with everything you need to keep the trip moving.
          </p>
        </div>
      ) : hasPassengers ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Your Tesla
              </span>
              <p className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {pool.tesla.plateNickname}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {pool.seatsUsed}/{pool.tesla.seatCapacity} seats filled
              </span>
              <StatusBadge status={pool.status} />
            </div>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {pool.rideRequests.map((ride) => (
              <div key={ride.id} className="px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {ride.passenger.name}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                      {ride.passenger.phone}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 sm:text-right">
                    {ride.pickupZone.name}
                    <span className="mx-1.5 text-zinc-400">→</span>
                    {ride.dropoffZone.name}
                  </p>
                </div>
                {ride.fare ? (
                  <div className="mt-4">
                    <FareBreakdown fare={ride.fare} />
                  </div>
                ) : (
                  <p className="mt-4 text-sm italic text-zinc-500 dark:text-zinc-400">
                    Fare pending…
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          This pool has no passengers attached to it yet.
        </div>
      )}
    </main>
  );
}