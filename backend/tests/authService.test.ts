import jwt from 'jsonwebtoken';
import { config } from '../src/config';
import { authService } from '../src/services/authService';
import { prisma } from '../src/utils/prisma';
import { ApiError } from '../src/utils/ApiError';
import { driverInput, passengerInput, resetDb } from './helpers';

describe('authService.register', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('registers a PASSENGER and returns a user without a Tesla', async () => {
    const user = await authService.register(passengerInput);

    expect(user.role).toBe('PASSENGER');
    expect(user.teslas).toBeUndefined();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { teslas: true },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.teslas).toHaveLength(0);
    expect(dbUser!.passwordHash).not.toBe(passengerInput.password);
    expect(dbUser!.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('registers a DRIVER and creates both User and Tesla in one transaction', async () => {
    const user = await authService.register(driverInput);

    expect(user.role).toBe('DRIVER');
    expect(user.teslas).toHaveLength(1);
    expect(user.teslas![0]).toMatchObject({
      plateNickname: 'Bullet',
      seatCapacity: 4,
      isActive: true,
    });

    const dbTesla = await prisma.tesla.findUnique({ where: { id: user.teslas![0].id } });
    expect(dbTesla?.driverId).toBe(user.id);
  });

  it('fails with 409 when the email is already registered', async () => {
    await authService.register(passengerInput);

    const duplicate = { ...passengerInput, phone: '01733333330', name: 'John Jr' };
    const error = await authService.register(duplicate).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(409);
    expect((error as ApiError).message).toMatch(/already exists/);
  });

  it('fails with 409 when the phone is already registered', async () => {
    await authService.register(passengerInput);

    const duplicate = { ...passengerInput, email: 'other@test.dev' };
    const error = await authService.register(duplicate).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(409);
  });
});

describe('authService.login', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('succeeds with correct email + password and returns a valid JWT', async () => {
    const registered = await authService.register(passengerInput);

    const { token, user } = await authService.login(passengerInput.email, passengerInput.password);

    expect(user.id).toBe(registered.id);
    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: number;
      role: string;
      exp?: number;
    };
    expect(decoded.userId).toBe(registered.id);
    expect(decoded.role).toBe('PASSENGER');
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('succeeds with correct phone + password', async () => {
    await authService.register(driverInput);

    const { token, user } = await authService.login(driverInput.phone, driverInput.password);

    expect(user.role).toBe('DRIVER');
    expect(user.teslas).toHaveLength(1);
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: number };
    expect(decoded.userId).toBe(user.id);
  });

  it('fails with 401 for a wrong password', async () => {
    await authService.register(passengerInput);

    const error = await authService
      .login(passengerInput.email, 'wrong-password')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(401);
  });

  it('fails with 401 (not 404) for a non-existent identifier', async () => {
    const error = await authService
      .login('nobody@test.dev', 'password123')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(401);
    expect((error as ApiError).statusCode).not.toBe(404);
  });
});
