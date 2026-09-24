import { PaymentMethod } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ZONE_GRAPH } from '../config/zoneGraph';

type DbClient = Prisma.TransactionClient | PrismaClient;

export const BASE_FARE_POYSHA = 3000;
export const DISTANCE_CHARGE_PER_ZONE_HOP_POYSHA = 1500;
export const POOL_DISCOUNT_POYSHA = 1000;

export interface FareDraft {
  baseFarePoysha: number;
  distanceChargePoysha: number;
  poolDiscountPoysha: number;
  totalFarePoysha: number;
}

/**
 * Shortest path (BFS) between two zones in hops, keyed by zone name so fares are
 * stable across DB reseeds. Unknown or unreachable zones fall back to a single
 * hop so a fare can always be produced.
 */
export function getZoneHops(fromZone: string, toZone: string): number {
  if (fromZone === toZone) return 0;
  if (!ZONE_GRAPH[fromZone] || !ZONE_GRAPH[toZone]) return 1;

  const queue: string[] = [fromZone];
  const distance = new Map<string, number>([[fromZone, 0]]);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const neighbor of ZONE_GRAPH[current]) {
      if (distance.has(neighbor)) continue;
      const nextDistance = (distance.get(current) as number) + 1;
      if (neighbor === toZone) return nextDistance;
      distance.set(neighbor, nextDistance);
      queue.push(neighbor);
    }
  }

  return 1;
}

/**
 * Pure fare calculation. All amounts are in poysha (integer subunit, 1 taka =
 * 100 poysha). A pooled ride (two or more riders in the pool) receives the pool
 * discount; a solo ride does not.
 */
export function computeFare(
  pickupZoneName: string,
  dropoffZoneName: string,
  isPooled: boolean,
): FareDraft {
  const distanceChargePoysha =
    getZoneHops(pickupZoneName, dropoffZoneName) * DISTANCE_CHARGE_PER_ZONE_HOP_POYSHA;
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
 * so the pool discount is consistent across all riders.
 */
export async function recomputePoolFares(db: DbClient, poolId: number): Promise<void> {
  const members = await db.rideRequest.findMany({
    where: { poolId, status: { notIn: ['CANCELLED'] } },
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
