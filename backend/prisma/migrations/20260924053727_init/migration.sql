-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PASSENGER', 'DRIVER');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TESLAPAY');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tesla" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "plateNickname" TEXT NOT NULL,
    "seatCapacity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tesla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideRequest" (
    "id" SERIAL NOT NULL,
    "passengerId" INTEGER NOT NULL,
    "pickupZoneId" INTEGER NOT NULL,
    "dropoffZoneId" INTEGER NOT NULL,
    "status" "RideStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poolId" INTEGER,

    CONSTRAINT "RideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "id" SERIAL NOT NULL,
    "teslaId" INTEGER NOT NULL,
    "status" "RideStatus" NOT NULL,
    "seatsUsed" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fare" (
    "id" SERIAL NOT NULL,
    "rideRequestId" INTEGER NOT NULL,
    "baseFarePoysha" INTEGER NOT NULL,
    "distanceChargePoysha" INTEGER NOT NULL,
    "poolDiscountPoysha" INTEGER NOT NULL,
    "totalFarePoysha" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Fare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideStatusHistory" (
    "id" SERIAL NOT NULL,
    "rideRequestId" INTEGER NOT NULL,
    "fromStatus" "RideStatus" NOT NULL,
    "toStatus" "RideStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Tesla_driverId_idx" ON "Tesla"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

-- CreateIndex
CREATE INDEX "RideRequest_status_idx" ON "RideRequest"("status");

-- CreateIndex
CREATE INDEX "RideRequest_pickupZoneId_idx" ON "RideRequest"("pickupZoneId");

-- CreateIndex
CREATE INDEX "RideRequest_requestedAt_idx" ON "RideRequest"("requestedAt");

-- CreateIndex
CREATE INDEX "Pool_teslaId_idx" ON "Pool"("teslaId");

-- CreateIndex
CREATE INDEX "Pool_status_idx" ON "Pool"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Fare_rideRequestId_key" ON "Fare"("rideRequestId");

-- CreateIndex
CREATE INDEX "RideStatusHistory_rideRequestId_idx" ON "RideStatusHistory"("rideRequestId");

-- AddForeignKey
ALTER TABLE "Tesla" ADD CONSTRAINT "Tesla_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_pickupZoneId_fkey" FOREIGN KEY ("pickupZoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_dropoffZoneId_fkey" FOREIGN KEY ("dropoffZoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_teslaId_fkey" FOREIGN KEY ("teslaId") REFERENCES "Tesla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fare" ADD CONSTRAINT "Fare_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "RideRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideStatusHistory" ADD CONSTRAINT "RideStatusHistory_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "RideRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cross-table invariant: Pool.seatsUsed must never exceed the related
-- Tesla.seatCapacity, and must never go below zero. PostgreSQL does not allow
-- subqueries in CHECK constraints, so the invariant is enforced with a trigger
-- that references the Tesla row. It is additionally enforced at the
-- application/transaction level on every seatsUsed read-modify-write.
CREATE OR REPLACE FUNCTION enforce_pool_seats_capacity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."seatsUsed" < 0 OR NEW."seatsUsed" > (SELECT "seatCapacity" FROM "Tesla" WHERE "Tesla"."id" = NEW."teslaId") THEN
        RAISE EXCEPTION 'Pool seatsUsed (%) exceeds the related Tesla seatCapacity or is negative', NEW."seatsUsed";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pool_seats_used_within_capacity
BEFORE INSERT OR UPDATE OF "seatsUsed", "teslaId" ON "Pool"
FOR EACH ROW
EXECUTE FUNCTION enforce_pool_seats_capacity();
