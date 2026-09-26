"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/apiClient";
import type { AvailableDriver, PaymentMethod, RideRequest, Zone } from "@/lib/types";
import { poyshaToTaka } from "@/lib/format";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { FieldErrors } from "@/components/FieldErrors";
import { useAuth } from "@/context/AuthContext";

interface FareEstimate {
  baseFarePoysha: number;
  distanceChargePoysha: number;
  poolDiscountPoysha: number;
  totalFarePoysha: number;
}

export default function NewRidePage() {
  const router = useRouter();
  const { authenticated, role, loading: authLoading } = useAuth();
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [pickupZoneId, setPickupZoneId] = useState("");
  const [dropoffZoneId, setDropoffZoneId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[] | null>(null);
  // Tracks which pickup zone the currently-loaded driver list belongs to, so the
  // loading state can be derived instead of set synchronously from an effect.
  const [driversZone, setDriversZone] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  // Auth gate
  useEffect(() => {
    if (authLoading) return;
    if (!authenticated) {
      router.replace("/login");
      return;
    }
    if (role === "DRIVER") {
      router.replace("/driver/dashboard");
    }
  }, [authenticated, role, authLoading, router]);

  // Load zones
  useEffect(() => {
    if (!authenticated || role === "DRIVER") return;
    let cancelled = false;
    apiClient
      .get<{ zones: Zone[] }>("/zones")
      .then((data) => {
        if (cancelled) return;
        setZones(data.zones);
        if (data.zones.length > 0 && !pickupZoneId) {
          setPickupZoneId(String(data.zones[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setZoneError("Could not load zones. Is the API running?");
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, role, pickupZoneId]);

  // Load available drivers when pickup zone changes. All state changes happen in
  // promise callbacks (never synchronously in the effect body).
  useEffect(() => {
    if (!pickupZoneId) return;

    let cancelled = false;
    apiClient
      .get<{ drivers: AvailableDriver[] }>(`/driver/available?pickupZoneId=${pickupZoneId}`)
      .then((data) => {
        if (!cancelled) {
          setAvailableDrivers(data.drivers);
          setDriversZone(pickupZoneId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableDrivers([]);
          setDriversZone(pickupZoneId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pickupZoneId]);

  // The driver list is loading while it has no data for the currently selected zone.
  const loadingDrivers = pickupZoneId !== "" && driversZone !== pickupZoneId;

  const sameZone = pickupZoneId !== "" && pickupZoneId === dropoffZoneId;
  const estimateReady = pickupZoneId !== "" && dropoffZoneId !== "" && !sameZone;

  // Fare estimate
  useEffect(() => {
    if (!estimateReady) return;
    let cancelled = false;
    apiClient
      .get<{ estimate: FareEstimate }>(
        `/fare-estimate?pickupZoneId=${pickupZoneId}&dropoffZoneId=${dropoffZoneId}`,
      )
      .then((data) => {
        if (!cancelled && estimateReady) {
          setEstimate(data.estimate);
        }
      })
      .catch(() => {
        if (!cancelled && estimateReady) setEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [estimateReady, pickupZoneId, dropoffZoneId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (sameZone) {
      setFormError("Pickup and dropoff zones must be different.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiClient.post<{ ride: RideRequest }>("/rides", {
        pickupZoneId: Number(pickupZoneId),
        dropoffZoneId: Number(dropoffZoneId),
        paymentMethod,
        driverId: selectedDriverId || undefined,
      });
      router.push(`/rides/${data.ride.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401) {
        setFormError(error.message);
      } else {
        setFormError("Failed to book ride. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const ready = pickupZoneId !== "" && dropoffZoneId !== "" && !sameZone;
  const pickupZoneName = zones?.find((z) => String(z.id) === pickupZoneId)?.name ?? "selected zone";

  if (authLoading || (!authenticated && authLoading)) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-48 rounded bg-[var(--muted)]" />
          <div className="h-4 w-64 rounded bg-[var(--muted)]" />
          <div className="h-64 rounded-2xl bg-[var(--muted)]" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Book a Tesla Pool Ride
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Select your route, choose an available driver in your zone, and split the fare.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Route Card */}
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            1. Select Route
          </h2>

          <FieldErrors error={zoneError} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="pickupZoneId"
              label="Pickup Zone (Station)"
              value={pickupZoneId}
              onChange={(e) => {
                setPickupZoneId(e.target.value);
                setSelectedDriverId(null);
              }}
              disabled={zones === null}
            >
              <option value="" disabled>
                {zones === null ? "Loading zones…" : "Select a pickup zone"}
              </option>
              {zones?.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  📍 {zone.name}
                </option>
              ))}
            </Select>

            <Select
              id="dropoffZoneId"
              label="Dropoff Zone (Destination)"
              value={dropoffZoneId}
              onChange={(e) => setDropoffZoneId(e.target.value)}
              disabled={zones === null}
            >
              <option value="" disabled>
                Select destination
              </option>
              {zones?.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  🏁 {zone.name}
                </option>
              ))}
            </Select>
          </div>

          {sameZone && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              Pickup and dropoff zones must be different.
            </p>
          )}
        </div>

        {/* Driver Selection Card */}
        {pickupZoneId && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                2. Choose Driver in {pickupZoneName}
              </h2>
              {availableDrivers && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  {availableDrivers.length} {availableDrivers.length === 1 ? "driver" : "drivers"} stationed here
                </span>
              )}
            </div>

            {loadingDrivers ? (
              <div className="space-y-2">
                <div className="h-16 animate-pulse rounded-xl bg-[var(--muted)]" />
                <div className="h-16 animate-pulse rounded-xl bg-[var(--muted)]" />
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Auto-match option */}
                <label
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all ${
                    selectedDriverId === null
                      ? "border-amber-500 bg-amber-50/50 shadow-sm dark:bg-amber-950/20"
                      : "border-[var(--card-border)] bg-[var(--muted)]/30 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="driverSelection"
                      checked={selectedDriverId === null}
                      onChange={() => setSelectedDriverId(null)}
                      className="h-4 w-4 text-amber-500 focus:ring-amber-400"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--foreground)]">
                          Auto-Match (Nearest Available Tesla)
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          Recommended
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                        System automatically matches you into any available Tesla heading your direction.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Fastest
                  </span>
                </label>

                {/* Available Drivers List */}
                {availableDrivers && availableDrivers.length > 0 ? (
                  availableDrivers.map((driver) => {
                    const isSelected = selectedDriverId === driver.id;
                    const hasSeats = driver.availableSeats > 0;

                    return (
                      <label
                        key={driver.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all ${
                          !hasSeats
                            ? "cursor-not-allowed border-[var(--card-border)] opacity-60 bg-[var(--muted)]/10"
                            : isSelected
                              ? "border-amber-500 bg-amber-50/50 shadow-sm dark:bg-amber-950/20"
                              : "border-[var(--card-border)] bg-[var(--muted)]/30 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="driverSelection"
                            value={driver.id}
                            disabled={!hasSeats}
                            checked={isSelected}
                            onChange={() => setSelectedDriverId(driver.id)}
                            className="h-4 w-4 text-amber-500 focus:ring-amber-400"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--foreground)]">
                                {driver.name}
                              </span>
                              <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--foreground)]">
                                ⚡ {driver.tesla.plateNickname}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                              📞 {driver.phone} · Stationed in {driver.location.name}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              hasSeats
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                hasSeats ? "bg-emerald-500" : "bg-red-500"
                              }`}
                            />
                            {hasSeats
                              ? `${driver.availableSeats} of ${driver.tesla.seatCapacity} seats free`
                              : "Fully booked"}
                          </span>
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--card-border)] p-4 text-center">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      No drivers are currently stationed in {pickupZoneName}. Selecting &quot;Auto-Match&quot; will assign the nearest Tesla once available.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment & Fare Card */}
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            3. Payment Method & Fare
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all ${
                paymentMethod === "CASH"
                  ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                  : "border-[var(--card-border)] text-[var(--muted-foreground)] hover:border-amber-300 hover:text-[var(--foreground)]"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="CASH"
                checked={paymentMethod === "CASH"}
                onChange={() => setPaymentMethod("CASH")}
                className="sr-only"
              />
              💵 Cash on Dropoff
            </label>
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all ${
                paymentMethod === "TESLAPAY"
                  ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                  : "border-[var(--card-border)] text-[var(--muted-foreground)] hover:border-amber-300 hover:text-[var(--foreground)]"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="TESLAPAY"
                checked={paymentMethod === "TESLAPAY"}
                onChange={() => setPaymentMethod("TESLAPAY")}
                className="sr-only"
              />
              ⚡ Tesla Pay
            </label>
          </div>

          {estimateReady && estimate && (
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-semibold tracking-wider text-amber-800 dark:text-amber-300">
                    Estimated Fare
                  </span>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Base fare (Tk 30) + distance charge. May be discounted if pooled with other riders!
                  </p>
                </div>
                <span className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {poyshaToTaka(estimate.totalFarePoysha)}
                </span>
              </div>
            </div>
          )}

          <FieldErrors error={formError} />
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          size="lg"
          loading={loading}
          disabled={!ready}
          id="confirm-ride-btn"
          className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3.5 shadow-md"
        >
          {sameZone
            ? "Pick two different zones"
            : selectedDriverId
              ? `Confirm & Send to Selected Driver`
              : "Confirm & Request Tesla Pool"}
        </Button>
      </form>
    </main>
  );
}