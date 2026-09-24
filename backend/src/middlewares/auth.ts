import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { verifyToken } from '../utils/jwt';
import { findById } from '../services/userService';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(
        401,
        'Missing or malformed Authorization header. Expected: Bearer <token>',
      );
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new ApiError(
        401,
        'Missing or malformed Authorization header. Expected: Bearer <token>',
      );
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new ApiError(401, 'Invalid or expired token');
    }

    const user = await findById(payload.userId);
    if (!user) {
      throw new ApiError(401, 'User for this token no longer exists');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export const requireRole =
  (role: Role) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      next(new ApiError(403, `Access denied: requires ${role} role`));
      return;
    }
    next();
  };
