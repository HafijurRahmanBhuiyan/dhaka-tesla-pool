import { Prisma, type RideStatus } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../utils/prisma';
import { logStatusTransition } from '../utils/logger';
import {
  ACTIVE_POOL_STATUSES,
  NEXT_FORWARD_STEP,
  POOL_STATUS_TRANSITIONS,
} from '../config/poolTransitions';

const ACTIVE_RIDES_ONLY = { status: { notIn: ['CANCELLED'] as RideStatus[] } };

const RIDE_WITH_PASSENGER_INCLUDE = {
  passenger: { select: { id: true, name: true, phone: true } },
  pickupZone: true,
  dropoffZone: true,
  fare: true,
} as const;

const POOL_WITH_RIDES_INCLUDE = {
  tesla: { select: { id: true, plateNickname: true } },
  rideRequests: {
    where: ACTIVE_RIDES_ONLY,
    orderBy: { id: 'asc' },
    include: RIDE_WITH_PASSENGER_INCLUDE,
  },
} as const;

type PoolWithRides = Prisma.PoolGetPayload<{ include: typeof POOL_WITH_RIDES_INCLUDE }>;

/**
 * Adds the driverId as a caller-owned filter around pool queries, so a driver
 * can never see (or target) another driver's Pools.
 */
function assertOwnPool(pool: { tesla: { driverId: number } }, driverId: number): void {
  if (pool.tesla.driverId !== driverId) {
    throw new ApiError(403, 'This pool belongs to another driver');
  }
}

/**
 * All of the driver's current (non-terminal) Pools with every assigned
 * passenger's zones and fare. Fares are included so the driver can reconcile
 * cash on completion.
 */
export async function getActivePools(driverId: number): Promise<PoolWithRides[]> {
  return prisma.pool.findMany({
    where: { tesla: { driverId }, status: { in: [...ACTIVE_POOL_STATUSES] } },
    orderBy: { id: 'asc' },
    include: POOL_WITH_RIDES_INCLUDE,
  });
}

async function withConflictRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2033' ||
          error.code === 'P2034' ||
          (error.code === 'P2010' && /40001|serializ|deadlock/i.test(error.message)));
      if (retryable) {
        if (attempt === 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unreachable: retry loop exhausted');
}

/**
 * Advances the driver's pool (and every active RideRequest in it) exactly one
 * step in the valid-transitions map. Falls back to the immediate next forward
 * step when no target is supplied. On completion every fare is frozen: CASH is
 * marked settled, TESLAPAY is additionally stamped with paidAt = now.
 */
export async function advancePool(
  driverId: number,
  poolId: number,
  targetStatus?: RideStatus,
): Promise<PoolWithRides> {
  return withConflictRetry(async () =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Pool" WHERE id = ${poolId} FOR UPDATE`;

      const pool = await tx.pool.findUnique({
        where: { id: poolId },
        include: {
          tesla: { select: { driverId: true } },
          rideRequests: { where: ACTIVE_RIDES_ONLY, include: { fare: true } },
        },
      });
      if (!pool) throw new ApiError(404, 'Pool not found');

      assertOwnPool(pool, driverId);

      const fromStatus = pool.status;
      const toStatus = targetStatus ?? NEXT_FORWARD_STEP[fromStatus];

      if (toStatus === null) {
        throw new ApiError(409, `Pool is already in a terminal state (${fromStatus})`);
      }
      if (!POOL_STATUS_TRANSITIONS[fromStatus].includes(toStatus)) {
        throw new ApiError(409, `Invalid transition from ${fromStatus} to ${toStatus}`);
      }

      const update: Prisma.PoolUpdateInput = { status: toStatus };
      if (toStatus === 'STARTED') update.startedAt = new Date();
      if (toStatus === 'COMPLETED') update.completedAt = new Date();

      await tx.pool.update({ where: { id: pool.id }, data: update });

      const rides = pool.rideRequests;
      for (const ride of rides) {
        await tx.rideRequest.update({
          where: { id: ride.id },
          data: { status: toStatus },
        });
        await logStatusTransition(tx, {
          rideRequestId: ride.id,
          fromStatus,
          toStatus,
          actor: `driver:${driverId}`,
        });
      }

      if (toStatus === 'COMPLETED') {
        await settlePoolFares(tx, rides);
      }

      return tx.pool.findUniqueOrThrow({
        where: { id: pool.id },
        include: POOL_WITH_RIDES_INCLUDE,
      });
    }),
  );
}

async function settlePoolFares(
  tx: Prisma.TransactionClient,
  rides: Array<{ id: number; fare: { paymentMethod: string } | null }>,
): Promise<void> {
  const now = new Date();
  for (const ride of rides) {
    await tx.fare.updateMany({
      where: { rideRequestId: ride.id },
      data: {
        settled: true,
        ...(ride.fare?.paymentMethod === 'TESLAPAY' ? { paidAt: now } : {}),
      },
    });
  }
}
