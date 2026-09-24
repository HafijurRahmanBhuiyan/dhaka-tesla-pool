import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config';

export interface AuthTokenPayload {
  userId: number;
  role: Role;
}

export const signToken = (payload: AuthTokenPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
};

export const verifyToken = (token: string): AuthTokenPayload => {
  return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
};
