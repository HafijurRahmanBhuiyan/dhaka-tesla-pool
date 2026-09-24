import type { Prisma, PrismaClient, RideStatus } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

interface StatusTransition {
  rideRequestId: number;
  fromStatus: RideStatus;
  toStatus: RideStatus;
  actor: string;
}

/**
 * Logs a ride status transition to the console and persists a row to
 * RideStatusHistory inside the caller's transaction (or standalone client).
 * The actor is surfaced in logs only; the schema has no actor column.
 */
export async function logStatusTransition(
  db: DbClient,
  { rideRequestId, fromStatus, toStatus, actor }: StatusTransition,
): Promise<void> {
  console.info(
    `[RideStatus] ride=${rideRequestId} ${fromStatus} -> ${toStatus} by ${actor} at ${new Date().toISOString()}`,
  );

  await db.rideStatusHistory.create({
    data: {
      rideRequestId,
      fromStatus,
      toStatus,
    },
  });
}
