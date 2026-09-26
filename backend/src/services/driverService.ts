import { Prisma, type PrismaClient, type RideStatus } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../utils/prisma';
import { logStatusTransition } from '../utils/logger';
import { NEXT_FORWARD_STEP, POOL_STATUS_TRANSITIONS } from '../config/poolTransitions';
import { recomputePoolState, TERMINAL_RIDE_STATUSES } from './poolStateService';

export const ACTIVE_RIDE_OFFLINE_MESSAGE = 'You have an active ride in progress';

export interface DriverStatus {
  teslaId: number;
  isActive: boolean;
  lastActiveAt: Date | null;
  seatCapacity: number;
  seatsUsed: number;
}

const RIDE_WITH_PASSENGER_INCLUDE = {
  passenger: { select: { id: true, name: true, phone: true } },
  pickupZone: true,
  dropoffZone: true,
  fare: true,
} as const;

// Active pools keep EVERY rider attached (including COMPLETED and CANCELLED
// ones) so the driver can see each rider's own live status, reconcile fares,
// and acknowledge in place that a rider cancelled.
const POOL_WITH_RIDES_INCLUDE = {
  tesla: { select: { id: true, plateNickname: true, seatCapacity: true } },
  rideRequests: {
    orderBy: { id: 'asc' },
    include: RIDE_WITH_PASSENGER_INCLUDE,
  },
} as const;

type PoolWithRides = Prisma.PoolGetPayload<{ include: typeof POOL_WITH_RIDES_INCLUDE }>;
type DbClient = Prisma.TransactionClient | PrismaClient;

/**
 * All of the driver's current (non-terminal) Pools with every assigned
 * passenger's zones and fare. Fares are included so the driver can reconcile
 * cash on completion. Each RideRequest carries its OWN status; the pool's status
 * is now only a coarse OPEN ('MATCHED') / CLOSED ('COMPLETED'/'CANCELLED') flag
 * used for capacity and matching, not a shared trip state.
 */
export async function getActivePools(driverId: number): Promise<PoolWithRides[]> {
  return prisma.pool.findMany({
    where: {
      tesla: { driverId },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
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

async function settleRideFare(
  tx: DbClient,
  rideRequestId: number,
  paymentMethod: string,
): Promise<void> {
  await tx.fare.updateMany({
    where: { rideRequestId },
    data: {
      settled: true,
      ...(paymentMethod === 'TESLAPAY' ? { paidAt: new Date() } : {}),
    },
  });
}

/**
 * Advances ONE RideRequest (not the whole pool) exactly one step along the
 * valid-transitions map, then re-derives the pool-level OPEN/CLOSED state from
 * the remaining members. A driver can move each passenger through their own
 * pickup/dropoff independently even when other passengers are already started
 * or completed.
 *
 * On completion the ride's own fare is settled: CASH is marked settled,
 * TESLAPAY is additionally stamped with paidAt = now.
 */
export async function advanceRide(
  driverId: number,
  rideRequestId: number,
  targetStatus?: RideStatus,
): Promise<PoolWithRides> {
  return withConflictRetry(async () =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RideRequest" WHERE id = ${rideRequestId} FOR UPDATE`;

      const ride = await tx.rideRequest.findUnique({
        where: { id: rideRequestId },
        include: {
          pool: { select: { id: true, tesla: { select: { driverId: true } } } },
          fare: true,
        },
      });
      if (!ride) throw new ApiError(404, 'Ride request not found');
      if (!ride.pool) throw new ApiError(409, 'This ride is not assigned to a pool yet');
      if (ride.pool.tesla.driverId !== driverId) {
        throw new ApiError(403, 'This pool belongs to another driver');
      }

      const fromStatus = ride.status;
      const toStatus = targetStatus ?? NEXT_FORWARD_STEP[fromStatus];

      if (toStatus === null) {
        throw new ApiError(409, `Ride is already in a terminal state (${fromStatus})`);
      }
      if (!POOL_STATUS_TRANSITIONS[fromStatus].includes(toStatus)) {
        throw new ApiError(409, `Invalid transition from ${fromStatus} to ${toStatus}`);
      }

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

      if (toStatus === 'COMPLETED' && ride.fare) {
        await settleRideFare(tx, ride.id, ride.fare.paymentMethod);
      }

      await recomputePoolState(tx, ride.pool.id);

      return tx.pool.findUniqueOrThrow({
        where: { id: ride.pool.id },
        include: POOL_WITH_RIDES_INCLUDE,
      });
    }),
  );
}

export interface AvailableDriver {
  id: number;
  name: string;
  phone: string;
  location: { id: number; name: string };
  tesla: {
    id: number;
    plateNickname: string;
    seatCapacity: number;
  };
  seatsUsed: number;
  availableSeats: number;
  isAvailable: boolean;
}

export async function updateDriverLocation(
  driverId: number,
  zoneId: number,
): Promise<{ id: number; name: string }> {
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
  if (!zone) {
    throw new ApiError(404, 'Zone not found');
  }

  await prisma.user.update({
    where: { id: driverId },
    data: { locationZoneId: zone.id },
  });

  return { id: zone.id, name: zone.name };
}

export async function getDriverLocation(
  driverId: number,
): Promise<{ id: number; name: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: driverId },
    include: { locationZone: { select: { id: true, name: true } } },
  });
  return user?.locationZone ?? null;
}

export async function getAvailableDriversInZone(pickupZoneId: number): Promise<AvailableDriver[]> {
  const drivers = await prisma.user.findMany({
    where: {
      role: 'DRIVER',
      locationZoneId: pickupZoneId,
    },
    include: {
      locationZone: { select: { id: true, name: true } },
      teslas: {
        where: { isActive: true },
        select: { id: true, plateNickname: true, seatCapacity: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  const results: AvailableDriver[] = [];

  for (const driver of drivers) {
    const activeTesla = driver.teslas[0];
    if (!activeTesla || !driver.locationZone) continue;

    const activePool = await prisma.pool.findFirst({
      where: {
        teslaId: activeTesla.id,
        status: 'MATCHED',
      },
      select: { seatsUsed: true },
    });

    const seatsUsed = activePool?.seatsUsed ?? 0;
    const availableSeats = Math.max(0, activeTesla.seatCapacity - seatsUsed);

    results.push({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      location: driver.locationZone,
      tesla: activeTesla,
      seatsUsed,
      availableSeats,
      isAvailable: availableSeats > 0,
    });
  }

  return results;
}

async function activeSeatsFor(db: DbClient, teslaId: number): Promise<number> {
  const activePool = await db.pool.findFirst({
    where: { teslaId, status: 'MATCHED' },
    select: { seatsUsed: true },
  });
  return activePool?.seatsUsed ?? 0;
}

function withDriverStatusShape(
  tesla: { id: number; isActive: boolean; lastActiveAt: Date | null; seatCapacity: number },
  seatsUsed: number,
): DriverStatus {
  return {
    teslaId: tesla.id,
    isActive: tesla.isActive,
    lastActiveAt: tesla.lastActiveAt,
    seatCapacity: tesla.seatCapacity,
    seatsUsed,
  };
}

/**
 * The driver's own Tesla online state plus live capacity. `Tesla.isActive` is
 * the single source of truth reused by the matching engine; reading it back
 * keeps the dashboard toggle honest across devices.
 */
export async function getDriverStatus(driverId: number): Promise<DriverStatus> {
  const tesla = await prisma.tesla.findFirst({ where: { driverId }, orderBy: { id: 'asc' } });
  if (!tesla) throw new ApiError(404, 'No Tesla is registered to this driver');
  return withDriverStatusShape(tesla, await activeSeatsFor(prisma, tesla.id));
}

/**
 * Toggles the driver's OWN Tesla online/offline (ownership comes from the
 * token, never from a client-supplied Tesla id). Going offline is refused with
 * 409 while any ride on that Tesla is still active, using the same terminal
 * statuses as the pool state machine so a driver cannot abandon a ride in
 * progress. Check + write run in one transaction that locks the Tesla row.
 */
export async function setDriverStatus(
  driverId: number,
  isActive: boolean,
): Promise<DriverStatus> {
  return withConflictRetry(() =>
    prisma.$transaction(async (tx) => {
      const tesla = await tx.tesla.findFirst({
        where: { driverId },
        orderBy: { id: 'asc' },
      });
      if (!tesla) throw new ApiError(404, 'No Tesla is registered to this driver');

      await tx.$queryRaw`SELECT id FROM "Tesla" WHERE id = ${tesla.id} FOR UPDATE`;

      if (!isActive) {
        const activeRide = await tx.rideRequest.findFirst({
          where: {
            pool: { teslaId: tesla.id },
            status: { notIn: TERMINAL_RIDE_STATUSES },
          },
          select: { id: true },
        });
        if (activeRide) throw new ApiError(409, ACTIVE_RIDE_OFFLINE_MESSAGE);
      }

      const updated = await tx.tesla.update({
        where: { id: tesla.id },
        data: { isActive, lastActiveAt: new Date() },
      });

      return withDriverStatusShape(updated, await activeSeatsFor(tx, updated.id));
    }),
  );
}

