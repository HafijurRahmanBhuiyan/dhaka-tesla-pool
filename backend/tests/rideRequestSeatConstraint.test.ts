import { prisma } from '../src/utils/prisma';
import { createPassenger, resetDb, ZONE } from './helpers';

const BANANI = ZONE.pickup.Banani;
const MOKHAKALI = ZONE.pickup.Mohakhali;

const rawInsert = (passengerId: number, seatsRequested: number) =>
  prisma.$executeRawUnsafe(
    `INSERT INTO "RideRequest" ("passengerId", "pickupZoneId", "dropoffZoneId", "seatsRequested")
     VALUES ($1, $2, $3, ${seatsRequested})
     RETURNING "id"`,
    passengerId,
    BANANI,
    MOKHAKALI,
  );

/**
 * Covers the "seatsRequested_positive" CHECK constraint, which is a database-level
 * safeguard layered on top of the zod schemas in src/utils/validation.ts. Every
 * write below goes straight to PostgreSQL — raw SQL or the Prisma client — so
 * none of it passes through the request-validation layer; the rejection can only
 * have come from the database itself.
 */
describe('RideRequest.seatsRequested database constraint', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects 0 and negative seat counts on insert and update, while still accepting valid counts', async () => {
    const passenger = await createPassenger();

    // INSERT bypassing the application layer entirely: 0 is refused by the database.
    await expect(rawInsert(passenger.id, 0)).rejects.toThrow(/seatsRequested_positive/);

    // ... and so is a negative count.
    await expect(rawInsert(passenger.id, -3)).rejects.toThrow(/seatsRequested_positive/);

    // A Prisma client write (no HTTP request, no zod) with 0 is refused as well.
    await expect(
      prisma.rideRequest.create({
        data: {
          passengerId: passenger.id,
          pickupZoneId: BANANI,
          dropoffZoneId: MOKHAKALI,
          seatsRequested: 0,
        },
      }),
    ).rejects.toThrow(/seatsRequested_positive/);

    // Neither rejection created a row.
    expect(await prisma.rideRequest.count()).toBe(0);

    // A legitimate request still inserts normally, and accepts a later bump.
    const ride = await prisma.rideRequest.create({
      data: {
        passengerId: passenger.id,
        pickupZoneId: BANANI,
        dropoffZoneId: MOKHAKALI,
        seatsRequested: 1,
      },
    });
    expect(ride.seatsRequested).toBe(1);

    const bumped = await prisma.rideRequest.update({
      where: { id: ride.id },
      data: { seatsRequested: 2 },
    });
    expect(bumped.seatsRequested).toBe(2);

    // But the UPDATE path is guarded too: 0 and negative are both refused.
    await expect(
      prisma.rideRequest.update({ where: { id: ride.id }, data: { seatsRequested: 0 } }),
    ).rejects.toThrow(/seatsRequested_positive/);
    await expect(
      prisma.rideRequest.update({ where: { id: ride.id }, data: { seatsRequested: -1 } }),
    ).rejects.toThrow(/seatsRequested_positive/);

    // The refused updates left the stored value untouched.
    const unchanged = await prisma.rideRequest.findUnique({ where: { id: ride.id } });
    expect(unchanged?.seatsRequested).toBe(2);
  });
});
