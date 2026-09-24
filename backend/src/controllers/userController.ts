import type { Request, Response } from 'express';
import { getProfile } from '../services/userService';

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await getProfile(req.user!.id);
  res.json({ user });
};
