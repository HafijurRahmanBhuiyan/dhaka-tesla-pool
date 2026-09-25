"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/apiClient";
import type { RideRequest, Role } from "@/lib/types";
import { formatDateTime, poyshaToTaka } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

const STATUS_ORDER = ["REQUESTED", "MATCHED", "DRIVER_ARRIVED", "STARTED", "COMPLETED", "CANCELLED"];

function RideCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <div className="h-5 w-48 rounded-lg bg-[var(--muted)]" />
          <div className="h-3.5 w-32 rounded bg-[var(--muted)]" />
        </div>
        <div className="h-6 w-20 rounded-full bg-[var(--muted)]" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-3.5 w-24 rounded bg-[var(--muted)]" />
        <div className="h-4 w-16 rounded bg-[var(--muted)]" />
      </div>
    </div>
  );
}

function RideCard({ ride }: { ride: RideRequest }) {
  const isCancelled = ride.status === "CANCELLED";
  const isActive = !["COMPLETED", "CANCELLED"].includes(ride.status);

  return (
    <Link
      href={`/rides/${ride.id}`}
      className="group block rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm transition-all hover:border-amber-300 hover:shadow-md dark:hover:border-amber-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            )}
            <h3 className="truncate font-semibold text-[var(--foreground)]">
              {ride.pickupZone.name}
              <span className="mx-2 text-[var(--muted-foreground)]">→</span>
              {ride.dropoffZone.name}
            </h3>
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {formatDateTime(ride.requestedAt)}
          </p>
        </div>
        <StatusBadge status={ride.status} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--muted)] pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
          {ride.pool?.tesla?.plateNickname ? (
            <>
              <svg className="h-4 w-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M13 2L4.09 12.97 11.5 12l-1.5 9 8.91-10.97H11.5L13 2z" />
              </svg>
              {ride.pool.tesla.plateNickname}
            </>
          ) : (
            <span className="italic">Waiting for a match…</span>
          )}
        </span>
        {ride.fare && !isCancelled ? (
          <span className="font-semibold tabular-nums text-[var(--foreground)]">
            {poyshaToTaka(ride.fare.totalFarePoysha)}
          </span>
        ) : isCancelled ? (
          <span className="text-[var(--muted-foreground)]">Cancelled</span>
        ) : (
          <span className="animate-pulse text-[var(--muted-foreground)]">Calculating…</span>
        )}
      </div>
    </Link>
  );
}

export default function RidesPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"auth" | "data">("auth");
  const [rides, setRides] = useState<RideRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        if (data.role === "DRIVER") {
          router.push("/driver/dashboard");
          return;
        }
        setPhase("data");
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (phase !== "data") return;
    let cancelled = false;
    apiClient
      .get<{ rides: RideRequest[] }>("/rides")
      .then((data) => {
        if (!cancelled) setRides(data.rides);
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof ApiError && err.status === 401)) {
          setError(err instanceof Error ? err.message : "Failed to load your rides.");
        }
      });
    return () => { cancelled = true; };
  }, [phase]);

  const activeRides = rides?.filter((r) => !["COMPLETED", "CANCELLED"].includes(r.status)) ?? [];
  const pastRides = rides?.filter((r) => ["COMPLETED", "CANCELLED"].includes(r.status)) ?? [];

  if (phase === "auth" || rides === null) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-36 animate-pulse rounded-lg bg-[var(--muted)]" />
            <div className="h-4 w-56 animate-pulse rounded bg-[var(--muted)]" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-xl bg-[var(--muted)]" />
        </div>
        <div className="grid gap-4">
          <RideCardSkeleton />
          <RideCardSkeleton />
          <RideCardSkeleton />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Your rides
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Track all your active and past pool rides.
          </p>
        </div>
        <Link
          href="/rides/new"
          id="request-ride-btn"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-400"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Request a ride
        </Link>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/50">
          <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {rides.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
            <svg
              className="h-8 w-8 text-amber-500"
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
          <h2 className="text-lg font-semibold text-[var(--foreground)]">No rides yet</h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">
            Request your first Tesla pool ride and share the journey with others heading your way.
          </p>
          <Link
            href="/rides/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-400"
          >
            Request your first ride
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {activeRides.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                Active
              </h2>
              <div className="grid gap-3">
                {activeRides.map((ride) => (
                  <RideCard key={ride.id} ride={ride} />
                ))}
              </div>
            </section>
          )}

          {pastRides.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                Past rides
              </h2>
              <div className="grid gap-3">
                {pastRides
                  .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
                  .map((ride) => (
                    <RideCard key={ride.id} ride={ride} />
                  ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}