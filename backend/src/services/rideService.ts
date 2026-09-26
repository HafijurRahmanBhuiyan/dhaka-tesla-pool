import { Prisma } from '@prisma/client';
import type { PaymentMethod, Role } from '@prisma/client';
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

/** Flat fee (poysha) charged when a passenger cancels after the driver arrived. */
export const ARRIVED_CANCELLATION_FEE_POYSHA = 1000;

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

async function cancelRideInternal(
  userId: number,
  rideRequestId: number,
  actorRole: Role,
  reason?: string,
): Promise<Prisma.RideRequestGetPayload<{ include: typeof RIDE_DETAIL_INCLUDE }>> {
  return withRetry(async () =>
    prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "RideRequest" WHERE id = ${rideRequestId} FOR UPDATE`;

        const ride = await tx.rideRequest.findUnique({
          where: { id: rideRequestId },
          include: { pool: { include: { tesla: { select: { driverId: true } } } } },
        });
        if (!ride) throw new ApiError(404, 'Ride request not found');

        // Ownership: passengers may only cancel their own ride; drivers only a
        // ride currently assigned to their own Tesla.
        if (actorRole === 'PASSENGER') {
          if (ride.passengerId !== userId) {
            throw new ApiError(403, 'Only the passenger can cancel this ride');
          }
        } else if (!ride.pool || ride.pool.tesla.driverId !== userId) {
          throw new ApiError(403, 'This pool belongs to another driver');
        }

        // Uber-style cancellation window:
        //   REQUESTED / MATCHED  -> either party cancels free.
        //   DRIVER_ARRIVED       -> either party cancels; passenger pays a flat
        //                           "driver showed up" fee, driver must state a
        //                           reason (no fee to the passenger).
        //   STARTED / terminal   -> cancellation is no longer allowed.
        const fromStatus = ride.status;
        let cancellationFee = 0;

        switch (ride.status) {
          case 'REQUESTED':
          case 'MATCHED':
            break;
          case 'DRIVER_ARRIVED':
            if (actorRole === 'PASSENGER') {
              cancellationFee = ARRIVED_CANCELLATION_FEE_POYSHA;
            } else if (!reason || reason.trim() === '') {
              throw new ApiError(400, 'A reason is required to cancel after arrival');
            }
            break;
          case 'STARTED':
          case 'COMPLETED':
          case 'CANCELLED':
            throw new ApiError(409, `Cannot cancel a ride in status ${ride.status}`);
        }

        const storedReason = reason ? reason.trim() : null;

        await tx.rideRequest.update({
          where: { id: ride.id },
          data: {
            status: 'CANCELLED',
            cancelledBy: actorRole,
            cancellationReason: storedReason,
          },
        });

        if (cancellationFee > 0) {
          await tx.fare.update({
            where: { rideRequestId: ride.id },
            data: { cancellationFeePoysha: cancellationFee },
          });
        }

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
          actor: `${actorRole.toLowerCase()}:${userId}`,
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

export async function cancelRide(
  userId: number,
  rideRequestId: number,
  options: { reason?: string } = {},
): Promise<Prisma.RideRequestGetPayload<{ include: typeof RIDE_DETAIL_INCLUDE }>> {
  return cancelRideInternal(userId, rideRequestId, 'PASSENGER', options.reason);
}

export async function cancelRideForDriver(
  driverId: number,
  rideRequestId: number,
  reason: string,
): Promise<Prisma.RideRequestGetPayload<{ include: typeof RIDE_DETAIL_INCLUDE }>> {
  return cancelRideInternal(driverId, rideRequestId, 'DRIVER', reason);
}
