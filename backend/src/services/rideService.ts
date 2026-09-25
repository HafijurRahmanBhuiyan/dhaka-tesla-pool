import { Prisma } from '@prisma/client';
import type { PaymentMethod } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../utils/prisma';
import { logStatusTransition } from '../utils/logger';
import { findOrCreatePoolForRide } from './poolService';
import { recomputePoolFares } from './fareService';
import { recomputePoolState } from './poolStateService';

export interface CreateRideInput {
  pickupZoneId: number;
  dropoffZoneId: number;
  paymentMethod: PaymentMethod;
  driverId?: number;
}

const RIDE_DETAIL_INCLUDE = {
  pickupZone: true,
  dropoffZone: true,
  pool: {
    include: {
      tesla: { select: { id: true, plateNickname: true, seatCapacity: true, driverId: true } },
    },
  },
  fare: true,
  statusHistory: { orderBy: { changedAt: 'asc' as const } },
} as const;

async function isTeslaDriverForRide(userId: number, rideRequestId: number): Promise<boolean> {
  const serving = await prisma.rideRequest.findFirst({
    where: { id: rideRequestId, pool: { tesla: { driverId: userId } } },
    select: { id: true },
  });
  return serving !== null;
}

export async function createRide(
  userId: number,
  input: CreateRideInput,
): Promise<Prisma.RideRequestGetPayload<{ include: typeof RIDE_DETAIL_INCLUDE }>> {
  const [pickupZone, dropoffZone] = await Promise.all([
    prisma.zone.findUnique({ where: { id: input.pickupZoneId } }),
    prisma.zone.findUnique({ where: { id: input.dropoffZoneId } }),
  ]);

  if (!pickupZone || !dropoffZone) {
    throw new ApiError(400, 'Unknown pickup or dropoff zone');
  }

  const ride = await prisma.rideRequest.create({
    data: {
      passengerId: userId,
      pickupZoneId: pickupZone.id,
      dropoffZoneId: dropoffZone.id,
      status: 'REQUESTED',
    },
  });

  await logStatusTransition(prisma, {
    rideRequestId: ride.id,
    fromStatus: 'REQUESTED',
    toStatus: 'REQUESTED',
    actor: `user:${userId}`,
  });

  await findOrCreatePoolForRide(ride.id, input.paymentMethod, input.driverId);

  return prisma.rideRequest.findUniqueOrThrow({
    where: { id: ride.id },
    include: RIDE_DETAIL_INCLUDE,
  });
}

export async function listRidesForPassenger(
  userId: number,
): Promise<Prisma.RideRequestGetPayload<{ include: typeof RIDE_DETAIL_INCLUDE }>[]> {
  return prisma.rideRequest.findMany({
    where: { passengerId: userId },
    orderBy: { requestedAt: 'desc' },
    include: RIDE_DETAIL_INCLUDE,
  });
}

export async function getRideForUser(
  userId: number,
  rideRequestId: number,
): Promise<Prisma.RideRequestGetPayload<{ include: typeof RIDE_DETAIL_INCLUDE }>> {
  const ride = await prisma.rideRequest.findUnique({
    where: { id: rideRequestId },
    include: RIDE_DETAIL_INCLUDE,
  });
  if (!ride) throw new ApiError(404, 'Ride request not found');

  const isPassenger = ride.passengerId === userId;
  if (!isPassenger && !(await isTeslaDriverForRide(userId, rideRequestId))) {
    throw new ApiError(403, 'You do not have access to this ride');
  }

  return ride;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2033' ||
          error.code === 'P2034' ||
          (error.code === 'P2010' && /40001|serializ|deadlock/i.test(error.message)))
      ) {
        if (attempt === 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unreachable: retry loop exhausted');
}

export async function cancelRide(
  userId: number,
  rideRequestId: number,
): Promise<Prisma.RideRequestGetPayload<{ include: typeof RIDE_DETAIL_INCLUDE }>> {
  return withRetry(async () =>
    prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "RideRequest" WHERE id = ${rideRequestId} FOR UPDATE`;

        const ride = await tx.rideRequest.findUnique({
          where: { id: rideRequestId },
          include: { pool: true },
        });
        if (!ride) throw new ApiError(404, 'Ride request not found');

        if (ride.passengerId !== userId) {
          throw new ApiError(403, 'Only the passenger can cancel this ride');
        }

        if (ride.status !== 'REQUESTED' && ride.status !== 'MATCHED') {
          throw new ApiError(409, `Cannot cancel a ride in status ${ride.status}`);
        }

        const fromStatus = ride.status;

        await tx.rideRequest.update({
          where: { id: ride.id },
          data: { status: 'CANCELLED' },
        });

        if (ride.pool) {
          // Re-derive the pool state from its members: a solo cancel closes the
          // pool, while a shared pool stays open for its remaining riders.
          const state = await recomputePoolState(tx, ride.pool.id);
          if (state.seatsUsed > 0) {
            // A survivor remains in a pooled trip, so their dynamic pool
            // discount must be recomputed.
            await recomputePoolFares(tx, ride.pool.id);
          }
        }

        await logStatusTransition(tx, {
          rideRequestId: ride.id,
          fromStatus,
          toStatus: 'CANCELLED',
          actor: `passenger:${userId}`,
        });

        return tx.rideRequest.findUniqueOrThrow({
          where: { id: ride.id },
          include: RIDE_DETAIL_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
