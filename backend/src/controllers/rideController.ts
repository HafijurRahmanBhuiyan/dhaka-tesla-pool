import type { Request, Response } from 'express';
import {
  cancelRide,
  createRide,
  getRideForUser,
  listRidesForPassenger,
} from '../services/rideService';
import type { CancelRideInput, CreateRideInput } from '../utils/validation';

export const createRideHandler = async (req: Request, res: Response): Promise<void> => {
  const ride = await createRide(req.user!.id, req.body as CreateRideInput);
  res.status(201).json({ ride });
};

export const listRides = async (req: Request, res: Response): Promise<void> => {
  const rides = await listRidesForPassenger(req.user!.id);
  res.json({ rides });
};

export const getRide = async (req: Request, res: Response): Promise<void> => {
  const ride = await getRideForUser(req.user!.id, Number(req.params.id));
  res.json({ ride });
};

export const cancelRideHandler = async (req: Request, res: Response): Promise<void> => {
  const ride = await cancelRide(req.user!.id, Number(req.params.id), {
    reason: (req.body as CancelRideInput | undefined)?.reason,
  });
  res.json({ ride });
};
