import type { Request, Response } from 'express';
import { advancePool, getActivePools } from '../services/driverService';
import type { AdvancePoolInput } from '../utils/validation';

export const getActivePoolsHandler = async (req: Request, res: Response): Promise<void> => {
  const pools = await getActivePools(req.user!.id);
  res.json({ pools });
};

export const advancePoolHandler = async (req: Request, res: Response): Promise<void> => {
  const pool = await advancePool(
    req.user!.id,
    Number(req.params.id),
    (req.body as AdvancePoolInput | undefined)?.status,
  );
  res.json({ pool });
};
