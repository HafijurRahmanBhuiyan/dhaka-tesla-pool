import type { Fare } from "@/lib/types";
import { poyshaToTaka } from "@/lib/format";

export function PaymentMethodLabel({ method }: { method: string }) {
  const label = method === "TESLAPAY" ? "Tesla Pay" : "Cash";
  return <span className="capitalize">{label}</span>;
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "font-semibold" : ""}`}>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="text-sm tabular-nums text-zinc-900 dark:text-zinc-100">{value}</span>
    </div>
  );
}

export function FareBreakdown({ fare }: { fare: Fare }) {
  const discount = fare.poolDiscountPoysha > 0;
  const cancellationFee = fare.cancellationFeePoysha > 0;
  const total = fare.totalFarePoysha + fare.cancellationFeePoysha;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Fare estimate</h3>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          Paid by <PaymentMethodLabel method={fare.paymentMethod} />
        </span>
      </div>
      <div className="space-y-1.5">
        <Row label="Base fare" value={poyshaToTaka(fare.baseFarePoysha)} />
        <Row
          label="Distance charge"
          value={poyshaToTaka(fare.distanceChargePoysha)}
        />
        {discount && (
          <Row label="Pool discount" value={poyshaToTaka(fare.poolDiscountPoysha)} />
        )}
        {cancellationFee && (
          <Row
            label="Cancellation fee"
            value={poyshaToTaka(fare.cancellationFeePoysha)}
          />
        )}
        <div className="my-2 border-t border-dashed border-zinc-200 dark:border-zinc-700" />
        <Row
          label={cancellationFee ? "Total due" : "Total"}
          value={poyshaToTaka(total)}
          strong
        />
      </div>
    </div>
  );
}