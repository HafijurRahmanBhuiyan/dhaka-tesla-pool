-- AlterTable
ALTER TABLE "Fare" ADD COLUMN     "cancellationFeePoysha" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RideRequest" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledBy" "Role";
