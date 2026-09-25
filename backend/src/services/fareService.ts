import { PaymentMethod } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getDistanceKm } from '../config/zoneDistance';

type DbClient = Prisma.TransactionClient | PrismaClient;

export const BASE_FARE_POYSHA = 3000;
export const PER_KM_CHARGE_POYSHA = 800;
export const POOL_DISCOUNT_POYSHA = 1000;

export interface FareDraft {
  baseFarePoysha: number;
  distanceChargePoysha: number;
  poolDiscountPoysha: number;
  totalFarePoysha: number;
}

/**
 * Pure fare calculation based on estimated road distance (see
 * config/zoneDistance.ts). All amounts are in poysha (integer subunit, 1 taka =
 * 100 poysha). A pooled ride (two or more active riders in the pool) receives
 * the pool discount; a solo ride does not.
 *
 *   fare = BASE (3000) + km * PER_KM (800) - pool discount (1000 if pooled)
 *
 * Distances are estimates for a deterministic hand-calculable price; they are
 * not live-routed or traffic-adjusted.
 */
export function computeFare(
  pickupZoneName: string,
  dropoffZoneName: string,
  isPooled: boolean,
): FareDraft {
  const distanceChargePoysha =
    getDistanceKm(pickupZoneName, dropoffZoneName) * PER_KM_CHARGE_POYSHA;
  const poolDiscountPoysha = isPooled ? POOL_DISCOUNT_POYSHA : 0;
  const totalFarePoysha = BASE_FARE_POYSHA + distanceChargePoysha - poolDiscountPoysha;

  return {
    baseFarePoysha: BASE_FARE_POYSHA,
    distanceChargePoysha,
    poolDiscountPoysha,
    totalFarePoysha,
  };
}

/**
 * Persists (or replaces) the Fare row for a ride request. Keyed on the unique
 * rideRequestId so rejoining a pool never duplicates a fare.
 */
export async function upsertFareForRide(
  db: DbClient,
  rideRequestId: number,
  pickupZoneName: string,
  dropoffZoneName: string,
  paymentMethod: PaymentMethod,
  isPooled: boolean,
): Promise<void> {
  const draft = computeFare(pickupZoneName, dropoffZoneName, isPooled);

  await db.fare.upsert({
    where: { rideRequestId },
    create: {
      rideRequestId,
      ...draft,
      paymentMethod,
    },
    update: {
      ...draft,
      paymentMethod,
    },
  });
}

/**
 * Recomputes fares for every active member of a pool after a membership change
 * so the pool discount is consistent across all riders. Only active
 * (non-terminal) members count toward the "two or more riders" threshold; the
 * discount is applied when the ride is priced, not re-litigated at completion.
 */
export async function recomputePoolFares(db: DbClient, poolId: number): Promise<void> {
  const members = await db.rideRequest.findMany({
    where: { poolId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    include: { pickupZone: true, dropoffZone: true, fare: true },
  });

  const isPooled = members.length > 1;

  for (const member of members) {
    await upsertFareForRide(
      db,
      member.id,
      member.pickupZone.name,
      member.dropoffZone.name,
      member.fare?.paymentMethod ?? PaymentMethod.CASH,
      isPooled,
    );
  }
}
