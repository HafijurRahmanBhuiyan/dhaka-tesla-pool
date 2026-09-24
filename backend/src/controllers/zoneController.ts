import type { Request, Response } from 'express';
import { listZones } from '../services/zoneService';

export const getZones = async (_req: Request, res: Response): Promise<void> => {
  const zones = await listZones();
  res.json({ zones });
};
