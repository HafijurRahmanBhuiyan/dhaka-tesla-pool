import type { Request, Response } from 'express';
import { authService } from '../services/authService';
import type { LoginInput, RegisterInput } from '../utils/validation';

export const register = async (req: Request, res: Response): Promise<void> => {
  const user = await authService.register(req.body as RegisterInput);
  res.status(201).json({ user });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { identifier, password } = req.body as LoginInput;
  const result = await authService.login(identifier, password);
  res.json(result);
};
