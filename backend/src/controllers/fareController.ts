import type { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { computeFare } from '../services/fareService';
import { fareEstimateQuerySchema } from '../utils/validation';

/**
 * Public, unauthenticated estimate for a potentially pooled ride. The estimate
 * is a SOLO price (no pool discount); the frontend notes that the actual fare
 * may be discounted if the ride mates into a pool. Distances are estimates, not
 * live-routed.
 */
export const getFareEstimateHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = fareEstimateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'pickupZoneId and dropoffZoneId are required numeric zone ids');
  }

  const { pickupZoneId, dropoffZoneId } = parsed.data;
  if (pickupZoneId === dropoffZoneId) {
    throw new ApiError(400, 'dropoffZoneId must differ from pickupZoneId');
  }

  const [pickupZone, dropoffZone] = await Promise.all([
    prisma.zone.findUnique({ where: { id: pickupZoneId } }),
    prisma.zone.findUnique({ where: { id: dropoffZoneId } }),
  ]);

  if (!pickupZone || !dropoffZone) {
    throw new ApiError(400, 'Unknown pickup or dropoff zone');
  }

  const draft = computeFare(pickupZone.name, dropoffZone.name, false);
  res.json({ estimate: draft });
};
