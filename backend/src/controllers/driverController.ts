import type { Request, Response } from 'express';
import { advanceRide, getActivePools } from '../services/driverService';
import type { AdvanceRideInput, UpdateDriverStatusInput } from '../utils/validation';

export const getActivePoolsHandler = async (req: Request, res: Response): Promise<void> => {
  const pools = await getActivePools(req.user!.id);
  res.json({ pools });
};

export const getDriverStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const { getDriverStatus } = await import('../services/driverService');
  const status = await getDriverStatus(req.user!.id);
  res.json({ status });
};

export const setDriverStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const { setDriverStatus } = await import('../services/driverService');
  const status = await setDriverStatus(req.user!.id, (req.body as UpdateDriverStatusInput).isActive);
  res.json({ status });
};

export const advanceRideHandler = async (req: Request, res: Response): Promise<void> => {
  const pool = await advanceRide(
    req.user!.id,
    Number(req.params.rideRequestId),
    (req.body as AdvanceRideInput | undefined)?.status,
  );
  res.json({ pool });
};

export const getDriverLocationHandler = async (req: Request, res: Response): Promise<void> => {
  const { getDriverLocation } = await import('../services/driverService');
  const location = await getDriverLocation(req.user!.id);
  res.json({ location });
};

export const updateDriverLocationHandler = async (req: Request, res: Response): Promise<void> => {
  const { updateDriverLocation } = await import('../services/driverService');
  const location = await updateDriverLocation(req.user!.id, req.body.zoneId);
  res.json({ success: true, location });
};

export const getAvailableDriversHandler = async (req: Request, res: Response): Promise<void> => {
  const { getAvailableDriversInZone } = await import('../services/driverService');
  const pickupZoneId = Number(req.query.pickupZoneId);
  if (!pickupZoneId || isNaN(pickupZoneId)) {
    res.json({ drivers: [] });
    return;
  }
  const drivers = await getAvailableDriversInZone(pickupZoneId);
  res.json({ drivers });
};
