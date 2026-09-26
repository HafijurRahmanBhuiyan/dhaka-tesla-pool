"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient, ApiError, toastBus } from "@/lib/apiClient";
import type {
  ActivePoolsResponse,
  DriverPool,
  DriverPoolRide,
  DriverStatus,
  DriverStatusResponse,
  RideStatus,
  Zone,
} from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { FareBreakdown } from "./FareBreakdown";

const ADVANCE_LABELS: Partial<Record<RideStatus, string>> = {
  MATCHED: "Mark arrived",
  DRIVER_ARRIVED: "Start ride",
  STARTED: "Complete ride",
};

const REQUIRED_ZONES = [
  "Banani",
  "Bashundhara",
  "Dhanmondi",
  "Farmgate",
  "Gulshan",
  "Mirpur",
  "Mohakhali",
  "Uttara",
];

function advanceLabelFor(ride: DriverPoolRide): string | null {
  return ADVANCE_LABELS[ride.status] ?? null;
}

const CANCELLABLE_STATUSES: RideStatus[] = ["REQUESTED", "MATCHED", "DRIVER_ARRIVED"];

function isCancellable(ride: DriverPoolRide): boolean {
  return CANCELLABLE_STATUSES.includes(ride.status);
}

function formatLastActive(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 animate-pulse space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-xl bg-[var(--muted)]" />
          <div className="h-4 w-72 rounded-lg bg-[var(--muted)]" />
        </div>
      </div>
      <div className="h-28 rounded-2xl bg-[var(--muted)]" />
      <div className="h-64 rounded-2xl bg-[var(--muted)]" />
    </div>
  );
}

export function DriverDashboard() {
  const router = useRouter();
  const { authenticated, role, loading: authLoading } = useAuth();
  const [pools, setPools] = useState<DriverPool[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [currentLocationName, setCurrentLocationName] = useState<string | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<number | null>(null);
  const [cancelPromptFor, setCancelPromptFor] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Auth gate
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

  // Load zones & current driver location
  useEffect(() => {
    if (!authenticated || role !== "DRIVER") return;
    let cancelled = false;

    // Load zones
    apiClient
      .get<{ zones: Zone[] }>("/zones")
      .then((data) => {
        if (!cancelled) {
          // Filter to required zones in specified order
          const sorted = [...data.zones].sort((a, b) => {
            const idxA = REQUIRED_ZONES.indexOf(a.name);
            const idxB = REQUIRED_ZONES.indexOf(b.name);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            return a.name.localeCompare(b.name);
          });
          setZones(sorted);
        }
      })
      .catch(() => undefined);

    // Load current location
    apiClient
      .get<{ location: { id: number; name: string } | null }>("/driver/location")
      .then((data) => {
        if (!cancelled && data.location) {
          setSelectedZoneId(String(data.location.id));
          setCurrentLocationName(data.location.name);
        }
      })
      .catch(() => undefined);

    // Load active pools
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

    // Load online/offline status
    apiClient
      .get<DriverStatusResponse>("/driver/status")
      .then((data) => {
        if (!cancelled) setStatus(data.status);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [authenticated, role]);

  async function handleLocationChange(zoneIdStr: string) {
    if (!zoneIdStr) return;
    setSelectedZoneId(zoneIdStr);
    setSavingLocation(true);
    try {
      const res = await apiClient.patch<{ success: boolean; location: { id: number; name: string } }>(
        "/driver/location",
        { zoneId: Number(zoneIdStr) },
      );
      setCurrentLocationName(res.location.name);
      toastBus.emit(`Location updated to ${res.location.name}. Passengers can now select you!`, "success");
    } catch (err) {
      if (err instanceof ApiError) {
        toastBus.emit(err.message, "error");
      } else {
        toastBus.emit("Failed to save location.", "error");
      }
    } finally {
      setSavingLocation(false);
    }
  }

  async function handleToggleStatus() {
    if (!status) return;
    const next = !status.isActive;
    setTogglingStatus(true);
    try {
      const res = await apiClient.patch<DriverStatusResponse>("/driver/status", {
        isActive: next,
      });
      setStatus(res.status);
      toastBus.emit(
        next
          ? "You are now online. Passengers in your zone can book your Tesla."
          : "You are now offline. New ride requests will not reach you.",
        "success",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toastBus.emit(err.message, "error");
      } else if (!(err instanceof ApiError)) {
        toastBus.emit("Failed to update your online status.", "error");
      }
      // Re-read the server state so the switch never shows a stale value.
      try {
        const current = await apiClient.get<DriverStatusResponse>("/driver/status");
        setStatus(current.status);
      } catch {
        /* server state is still authoritative */
      }
    } finally {
      setTogglingStatus(false);
    }
  }

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

  async function handleAdvance(ride: DriverPoolRide) {
    setAdvancingId(ride.id);
    try {
      await apiClient.patch<{ pool: DriverPool }>(`/driver/rides/${ride.id}/advance`, {});
      toastBus.emit(
        `${ride.passenger.name} → ${advanceLabelFor(ride) ?? "updated"}.`,
        "success",
      );
      await refreshPools();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toastBus.emit(err.message, "error");
        await refreshPools();
      }
    } finally {
      setAdvancingId(null);
    }
  }

  async function handleCancelRide(ride: DriverPoolRide) {
    const reason = cancelReason.trim();
    if (!reason) return;
    setCancellingId(ride.id);
    try {
      await apiClient.patch(`/driver/rides/${ride.id}/cancel`, { reason });
      toastBus.emit(`Cancelled ${ride.passenger.name}'s ride.`, "success");
      setCancelPromptFor(null);
      setCancelReason("");
      await refreshPools();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toastBus.emit(err.message, "error");
        await refreshPools();
      }
    } finally {
      setCancellingId(null);
    }
  }

  if (authLoading || (!authenticated && authLoading)) {
    return <DashboardSkeleton />;
  }

  const loadingPools = pools === null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      {/* Page Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Driver Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Manage your location and advance passengers through their individual journey steps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshPools()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] shadow-sm transition-all hover:bg-[var(--muted)]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Online Status Section */}
      <div className="mb-8 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                status?.isActive
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--foreground)]">
                  Online Status
                </h2>
                {status ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      status.isActive
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        status.isActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                      }`}
                    />
                    {status.isActive ? "Online" : "Offline"}
                  </span>
                ) : (
                  <span className="text-xs italic text-[var(--muted-foreground)]">
                    Loading…
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {status
                  ? status.isActive
                    ? `${status.seatsUsed} of ${status.seatCapacity} seats filled while online.`
                    : status.lastActiveAt
                      ? `You went offline at ${formatLastActive(status.lastActiveAt)}. New ride requests will not reach you.`
                      : "You are offline. New ride requests will not reach you."
                  : "Fetching your current online state…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Seats free
              </p>
              <p className="text-lg font-bold text-[var(--foreground)]">
                {status ? status.seatCapacity - status.seatsUsed : "–"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={status?.isActive ?? false}
              disabled={!status || togglingStatus}
              onClick={() => void handleToggleStatus()}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                status?.isActive ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  status?.isActive ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Driver Location Section */}
      <div className="mb-8 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--foreground)]">
                  Your Current Stationed Location
                </h2>
                {currentLocationName ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Stationed in {currentLocationName}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    No location set
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Select where your Tesla is currently waiting. Passengers booking rides from this pickup zone will see you and can select you directly.
              </p>
            </div>
          </div>

          {/* Location Dropdown */}
          <div className="w-full sm:w-64">
            <label htmlFor="driver-location-select" className="sr-only">
              Select your location
            </label>
            <div className="relative">
              <select
                id="driver-location-select"
                value={selectedZoneId}
                onChange={(e) => void handleLocationChange(e.target.value)}
                disabled={savingLocation}
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--muted)] px-3.5 py-2.5 pr-8 text-sm font-medium text-[var(--foreground)] transition-colors focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  Select your zone…
                </option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    📍 {zone.name}
                  </option>
                ))}
              </select>
              {savingLocation && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <svg className="h-4 w-4 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Pools Section */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--foreground)]">
          Active Passenger Pools
        </h2>
        {pools && pools.length > 0 && (
          <span className="text-xs font-medium text-[var(--muted-foreground)]">
            {pools.length} active {pools.length === 1 ? "pool" : "pools"}
          </span>
        )}
      </div>

      {loadingPools ? (
        <div className="space-y-4">
          <div className="h-48 rounded-2xl bg-[var(--muted)] animate-pulse" />
        </div>
      ) : pools === null || pools.length === 0 ? (
        status !== null && !status.isActive ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              <svg
                className="h-7 w-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 012.121 9.192 9 9 0 01-12.485 4.728m9.364-13.92a9 9 0 00-14.485 5.728m0 0V5.625m0 3.375H4.25" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              You are offline
            </h3>
            <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">
              You are offline. Go online to receive ride requests.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <svg
              className="h-7 w-7"
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
          </div>
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            No active pools right now
          </h3>
          <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">
            When passengers request a ride matching your location and route, they will appear here with individual controls to advance each trip.
          </p>
        </div>
        )
      ) : (
        <div className="space-y-6">
          {pools.map((pool) => {
            const rides = pool.rideRequests;
            const seatsAvailable = pool.tesla.seatCapacity - pool.seatsUsed;

            return (
              <div
                key={pool.id}
                className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm"
              >
                {/* Pool Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] bg-[var(--muted)]/40 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                        <path d="M13 2L4.09 12.97 11.5 12l-1.5 9 8.91-10.97H11.5L13 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                          Tesla:
                        </span>
                        <span className="font-bold text-[var(--foreground)]">
                          {pool.tesla.plateNickname}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Pool ID #{pool.id}
                      </p>
                    </div>
                  </div>

                  {/* Seat stats */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-semibold text-[var(--foreground)]">
                      <span className={`h-2 w-2 rounded-full ${seatsAvailable > 0 ? "bg-emerald-500" : "bg-red-500"}`} />
                      {pool.seatsUsed} / {pool.tesla.seatCapacity} seats filled
                      {seatsAvailable > 0 ? ` (${seatsAvailable} available)` : " (Full)"}
                    </span>
                  </div>
                </div>

                {/* Individual Passenger Rides */}
                <div className="divide-y divide-[var(--card-border)]">
                  {rides.map((ride) => {
                    const actionLabel = advanceLabelFor(ride);
                    const isAdvancing = advancingId === ride.id;
                    return (
                      <div
                        key={ride.id}
                        className={`p-6 transition-colors hover:bg-[var(--muted)]/20 ${
                          ride.status === "CANCELLED" ? "opacity-70" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-[var(--foreground)]">
                                {ride.passenger.name}
                              </p>
                              <StatusBadge status={ride.status} />
                            </div>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              📞 {ride.passenger.phone}
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
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {isCancellable(ride) && (
                              <Button
                                size="sm"
                                variant="danger"
                                loading={cancellingId === ride.id}
                                disabled={isAdvancing}
                                onClick={() => {
                                  setCancelPromptFor(ride.id);
                                  setCancelReason("");
                                }}
                                className="font-semibold shadow-sm"
                              >
                                Cancel This Ride
                              </Button>
                            )}
                            {actionLabel && (
                              <Button
                                size="sm"
                                loading={isAdvancing}
                                onClick={() => void handleAdvance(ride)}
                                className="bg-amber-500 hover:bg-amber-400 text-white font-semibold shadow-sm"
                              >
                                {actionLabel}
                              </Button>
                            )}
                          </div>
                        </div>

                        {isCancellable(ride) &&
                          cancelPromptFor === ride.id && (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                              <p className="text-xs font-medium text-red-700 dark:text-red-300">
                                Why are you cancelling {ride.passenger.name}&apos;s ride?
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={cancelReason}
                                  onChange={(e) => setCancelReason(e.target.value)}
                                  placeholder="Reason (required)"
                                  disabled={cancellingId === ride.id}
                                  className="min-w-0 flex-1 rounded-lg border border-red-200 bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20 disabled:opacity-60 dark:border-red-900"
                                />
                                <Button
                                  size="sm"
                                  variant="danger"
                                  loading={cancellingId === ride.id}
                                  disabled={!cancelReason.trim()}
                                  onClick={() => void handleCancelRide(ride)}
                                >
                                  Confirm cancel
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={cancellingId === ride.id}
                                  onClick={() => {
                                    setCancelPromptFor(null);
                                    setCancelReason("");
                                  }}
                                >
                                  Keep
                                </Button>
                              </div>
                            </div>
                          )}

                        {ride.fare ? (
                          <div className="mt-4">
                            <FareBreakdown fare={ride.fare} />
                          </div>
                        ) : (
                          <p className="mt-4 text-xs italic text-[var(--muted-foreground)]">
                            Fare calculation pending…
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}