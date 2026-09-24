import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../utils/prisma';
import { logStatusTransition } from '../utils/logger';
import { areRidesCompatible } from '../utils/matching';
import { recomputePoolFares } from './fareService';

const MAX_CREATE_POOL_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 50;

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2033' || error.code === 'P2034') return true;
  // Raw queries surface serialization failures (SQLSTATE 40001) as P2010.
  return error.code === 'P2010' && /40001|serializ|deadlock/i.test(error.message);
}

interface RideForMatching {
  id: number;
  pickupZoneName: string;
  dropoffZoneName: string;
}

/**
 * Runs `fn` inside a serializable transaction, retrying on Prisma transaction
 * conflict errors (P2033 / P2034) with a small linear backoff. Serialization
 * failures surface as conflicts when two requests race for the same pool seat.
 */
async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_CREATE_POOL_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isRetryableTransactionError(error)) {
        if (attempt === MAX_CREATE_POOL_RETRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unreachable: retry loop exhausted');
}

async function loadRideWithZones(
  tx: Prisma.TransactionClient,
  rideRequestId: number,
): Promise<RideForMatching> {
  const ride = await tx.rideRequest.findUnique({
    where: { id: rideRequestId },
    include: { pickupZone: true, dropoffZone: true },
  });
  if (!ride) throw new ApiError(404, 'Ride request not found');
  return {
    id: ride.id,
    pickupZoneName: ride.pickupZone.name,
    dropoffZoneName: ride.dropoffZone.name,
  };
}

interface CompatiblePool {
  poolId: number;
  members: Array<{ id: number }>;
}

/**
 * Pick the first open pool (MATCHED, active tesla, free seat) whose current
 * members' rides are compatible with the incoming ride. All open pools are
 * already locked FOR UPDATE by the caller.
 */
function findCompatiblePool(
  ride: RideForMatching,
  openPools: Array<{
    id: number;
    seatsUsed: number;
    tesla: { seatCapacity: number };
    members: RideForMatching[];
  }>,
): CompatiblePool | null {
  for (const pool of openPools) {
    if (pool.seatsUsed >= pool.tesla.seatCapacity) continue;
    const isCompatible = pool.members.some((member) => areRidesCompatible(ride, member));
    if (!isCompatible) continue;
    return { poolId: pool.id, members: pool.members };
  }
  return null;
}

/**
 * Attempts to join `rideRequestId` to an existing compatible open pool, or
 * creates a new pool on an idle active Tesla.
 *
 * Runs under SERIALIZABLE isolation with FOR UPDATE locks on every open pool and
 * every active Tesla, so two concurrent requests can never overbook a seat: the
 * capacity is re-verified after acquiring the locks, and the Postgres trigger
 * `pool_seats_used_within_capacity` guards the seatsUsed increment as a final
 * backstop.
 *
 * Matching rule (see docs/matching-rule.md): a ride joins a pool when it has the
 * same pickupZoneId as the pool's existing rider AND its dropoffZoneId either
 * matches that rider's exactly or sits in the same compatible zone group.
 */
export async function findOrCreatePoolForRide(rideRequestId: number): Promise<{ poolId: number }> {
  return withSerializableRetry(async (tx) => {
    const ride = await loadRideWithZones(tx, rideRequestId);

    const openPools = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM "Pool"
      WHERE "status" = 'MATCHED'
        AND "teslaId" IN (SELECT id FROM "Tesla" WHERE "isActive" = true)
      ORDER BY id ASC
      FOR UPDATE
    `);

    let chosenPool: CompatiblePool | null = null;

    if (openPools.length > 0) {
      const pools = await tx.pool.findMany({
        where: { id: { in: openPools.map((p) => p.id) } },
        include: {
          tesla: { select: { seatCapacity: true } },
          rideRequests: {
            where: { status: { notIn: ['CANCELLED'] } },
            include: { pickupZone: true, dropoffZone: true },
          },
        },
      });

      const poolCandidates = pools.map((pool) => ({
        id: pool.id,
        seatsUsed: pool.seatsUsed,
        tesla: pool.tesla,
        members: pool.rideRequests.map((member) => ({
          id: member.id,
          pickupZoneName: member.pickupZone.name,
          dropoffZoneName: member.dropoffZone.name,
        })),
      }));

      chosenPool = findCompatiblePool(ride, poolCandidates);
    }

    let poolId: number;

    if (chosenPool) {
      poolId = chosenPool.poolId;
      await tx.pool.update({
        where: { id: poolId },
        data: { seatsUsed: { increment: 1 } },
      });
      await tx.rideRequest.update({
        where: { id: ride.id },
        data: { status: 'MATCHED', poolId },
      });
      await logStatusTransition(tx, {
        rideRequestId: ride.id,
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
        actor: `pool-join:${poolId}`,
      });
    } else {
      const lockedTeslas = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        SELECT id FROM "Tesla" WHERE "isActive" = true ORDER BY id ASC FOR UPDATE
      `);

      if (lockedTeslas.length === 0) {
        throw new ApiError(409, 'No Tesla available to serve this ride');
      }

      const teslas = await tx.tesla.findMany({
        where: { id: { in: lockedTeslas.map((t) => t.id) } },
        include: { pools: true },
      });

      // A Tesla serves one pool at a time: only an idle active Tesla (no open
      // MATCHED pool) can start a new pool.
      const idleTesla = teslas.find(
        (tesla) => !tesla.pools.some((pool) => pool.status === 'MATCHED'),
      );

      if (!idleTesla) {
        throw new ApiError(409, 'No Tesla available to serve this ride');
      }

      const createdPool = await tx.pool.create({
        data: { teslaId: idleTesla.id, status: 'MATCHED', seatsUsed: 1 },
      });
      poolId = createdPool.id;

      await tx.rideRequest.update({
        where: { id: ride.id },
        data: { status: 'MATCHED', poolId },
      });
      await logStatusTransition(tx, {
        rideRequestId: ride.id,
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
        actor: `pool-create:${poolId}`,
      });
    }

    await recomputePoolFares(tx, poolId);

    return { poolId };
  });
}
