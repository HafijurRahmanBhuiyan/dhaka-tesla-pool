import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { authService } from '../src/services/authService';
import { prisma } from '../src/utils/prisma';
import { driverInput, passengerInput, resetDb } from './helpers';

const app = createApp();

describe('POST /api/auth/register', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns 201 and no Tesla for a PASSENGER', async () => {
    const res = await request(app).post('/api/auth/register').send(passengerInput);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      id: expect.any(Number),
      name: passengerInput.name,
      role: 'PASSENGER',
    });
    expect(res.body.user.teslas).toBeUndefined();
  });

  it('returns 400 for a DRIVER without tesla details', async () => {
    const driverWithoutTesla = {
      name: driverInput.name,
      phone: driverInput.phone,
      email: driverInput.email,
      password: driverInput.password,
      role: driverInput.role,
    };
    const res = await request(app).post('/api/auth/register').send(driverWithoutTesla);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'tesla', message: expect.stringMatching(/required/i) }),
      ]),
    );
  });

  it('returns 201 and creates a linked Tesla for a DRIVER', async () => {
    const res = await request(app).post('/api/auth/register').send(driverInput);

    expect(res.status).toBe(201);
    expect(res.body.user.teslas).toHaveLength(1);
    expect(res.body.user.teslas[0]).toMatchObject({
      plateNickname: 'Bullet',
      seatCapacity: 3,
      isActive: true,
    });
  });

  it('returns 409 for a duplicate email or phone', async () => {
    await request(app).post('/api/auth/register').send(passengerInput);

    const dupEmail = await request(app)
      .post('/api/auth/register')
      .send({ ...passengerInput, phone: '01733333330' });
    expect(dupEmail.status).toBe(409);

    const dupPhone = await request(app)
      .post('/api/auth/register')
      .send({ ...passengerInput, email: 'other@test.dev' });
    expect(dupPhone.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await resetDb();
    await authService.register(passengerInput);
  });

  it('returns a token + profile when logging in by email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: passengerInput.email, password: passengerInput.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(passengerInput.email);

    const decoded = jwt.verify(res.body.token, config.jwtSecret) as {
      userId: number;
      role: string;
    };
    expect(decoded.role).toBe('PASSENGER');
  });

  it('returns a token when logging in by phone', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: passengerInput.phone, password: passengerInput.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('returns 400 for an invalid identifier format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'not-an-identifier', password: passengerInput.password });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 401 for a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: passengerInput.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email/phone or password');
  });
});

describe('GET /api/users/me', () => {
  beforeEach(async () => {
    await resetDb();
    await authService.register(passengerInput);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const token = jwt.sign({ userId: 1, role: 'PASSENGER' }, config.jwtSecret, {
      expiresIn: -10,
    });
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('returns the logged-in user profile with a valid token', async () => {
    const { token } = await authService.login(passengerInput.email, passengerInput.password);

    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: passengerInput.email,
      phone: passengerInput.phone,
      role: 'PASSENGER',
    });
  });

  it('returns 404 for a valid token of a deleted user', async () => {
    const { token, user } = await authService.login(passengerInput.email, passengerInput.password);
    await prisma.user.delete({ where: { id: user.id } });

    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
