-- AlterTable
ALTER TABLE "User" ADD COLUMN "locationZoneId" INTEGER;

-- CreateIndex
CREATE INDEX "User_locationZoneId_idx" ON "User"("locationZoneId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_locationZoneId_fkey" FOREIGN KEY ("locationZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
