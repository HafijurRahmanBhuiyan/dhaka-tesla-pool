import type { Request, Response } from 'express';
import { healthService } from '../services/healthService';

export const healthController = (_req: Request, res: Response): void => {
  const status = healthService.getStatus();
  res.status(200).json(status);
};
