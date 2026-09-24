"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/apiClient";
import type { PaymentMethod, RideRequest, Zone } from "@/lib/types";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { FieldErrors } from "@/components/FieldErrors";

export default function NewRidePage() {
  const router = useRouter();
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [pickupZoneId, setPickupZoneId] = useState("");
  const [dropoffZoneId, setDropoffZoneId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ zones: Zone[] }>("/zones")
      .then((data) => {
        if (cancelled) return;
        setZones(data.zones);
        if (data.zones.length > 0) setPickupZoneId(String(data.zones[0].id));
      })
      .catch(() => {
        if (!cancelled) setZoneError("Could not load zones. Is the API running?");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sameZone = pickupZoneId !== "" && pickupZoneId === dropoffZoneId;

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
      });
      router.push(`/rides/${data.ride.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401) {
        setFormError(error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const ready = pickupZoneId !== "" && dropoffZoneId !== "" && !sameZone;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Request a Tesla
      </h1>
      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
        Tell us where you are going and we will match you into a pool ride.
      </p>

      <form onSubmit={handleSubmit} className="mt-6" noValidate>
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <FieldErrors error={zoneError} />

          <Select
            id="pickupZoneId"
            label="Pickup zone"
            value={pickupZoneId}
            onChange={(e) => setPickupZoneId(e.target.value)}
            disabled={zones === null}
          >
            <option value="" disabled>
              {zones === null ? "Loading zones…" : "Select a pickup zone"}
            </option>
            {zones?.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </Select>

          <Select
            id="dropoffZoneId"
            label="Dropoff zone"
            value={dropoffZoneId}
            onChange={(e) => setDropoffZoneId(e.target.value)}
            disabled={zones === null}
          >
            <option value="" disabled>
              Select a destination
            </option>
            {zones?.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </Select>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Payment method
            </span>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  paymentMethod === "CASH"
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                    : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                Cash
              </label>
              <label
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  paymentMethod === "TESLAPAY"
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                    : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                Tesla Pay
              </label>
            </div>
          </div>

          <FieldErrors error={formError} />
        </div>

        <Button
          type="submit"
          size="lg"
          loading={loading}
          disabled={!ready}
          className="mt-4 w-full"
        >
          {sameZone ? "Pick two different zones" : "Request a Tesla"}
        </Button>
      </form>
    </main>
  );
}