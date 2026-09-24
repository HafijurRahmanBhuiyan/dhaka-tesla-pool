import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../src/config';
import { requireAuth, requireRole } from '../src/middlewares/auth';
import { authService } from '../src/services/authService';
import type { ApiError } from '../src/utils/ApiError';
import { prisma } from '../src/utils/prisma';
import { passengerInput, resetDb } from './helpers';

const makeContext = (authorization?: string) => {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  const res = {} as Response;
  const next: NextFunction = jest.fn();
  return { req, res, next };
};

describe('requireAuth', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('attaches req.user and calls next() for a valid token', async () => {
    const user = await authService.register(passengerInput);
    const token = jwt.sign({ userId: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: '1h',
    });
    const { req, res, next } = makeContext(`Bearer ${token}`);

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.user?.id).toBe(user.id);
    expect(req.user?.role).toBe('PASSENGER');
  });

  it('rejects with 401 when the Authorization header is missing', async () => {
    const { req, res, next } = makeContext();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(req.user).toBeUndefined();
  });

  it('rejects with 401 for a malformed Authorization header', async () => {
    const { req, res, next } = makeContext('Basic abcdef123');

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ApiError>>({ statusCode: 401 }),
    );
  });

  it('rejects with 401 for an expired token', async () => {
    const user = await authService.register(passengerInput);
    const expired = jwt.sign({ userId: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: -10,
    });
    const { req, res, next } = makeContext(`Bearer ${expired}`);

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(req.user).toBeUndefined();
  });

  it('rejects with 401 when the token belongs to a deleted user', async () => {
    const user = await authService.register(passengerInput);
    await prisma.user.delete({ where: { id: user.id } });

    const token = jwt.sign({ userId: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: '1h',
    });
    const { req, res, next } = makeContext(`Bearer ${token}`);

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('requireRole', () => {
  it('calls next() when the role matches', () => {
    const { req, res, next } = makeContext();
    req.user = { role: 'DRIVER' } as Request['user'];

    requireRole('DRIVER')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with 403 when the role does not match', () => {
    const { req, res, next } = makeContext();
    req.user = { role: 'PASSENGER' } as Request['user'];

    requireRole('DRIVER')(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('rejects with 403 when req.user is missing', () => {
    const { req, res, next } = makeContext();

    requireRole('DRIVER')(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
