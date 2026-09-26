import request from 'supertest';
import { createApp } from '../src/app';
import { resetDb } from './helpers';

const app = createApp();

describe('GET /api/fare-estimate', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('is public (no auth) and returns a solo distance-based estimate', async () => {
    const res = await request(app).get(
      '/api/fare-estimate?pickupZoneId=1&dropoffZoneId=3', // Banani -> Mohakhali, 4 km
    );

    expect(res.status).toBe(200);
    expect(res.body.estimate).toEqual({
      baseFarePoysha: 3000,
      distanceChargePoysha: 3200,
      poolDiscountPoysha: 0,
      totalFarePoysha: 6200,
    });
  });

  it('estimates the PRD story route solo', async () => {
    const res = await request(app).get(
      '/api/fare-estimate?pickupZoneId=1&dropoffZoneId=2', // Banani -> Gulshan, 3 km
    );

    expect(res.status).toBe(200);
    expect(res.body.estimate.totalFarePoysha).toBe(5400);
  });

  it('scales the estimate by seatsRequested', async () => {
    // Banani -> Mohakhali = 4 km, solo base 6200. Two seats => 12400, with each
    // component (base 3000, distance 3200) doubled.
    const res = await request(app).get(
      '/api/fare-estimate?pickupZoneId=1&dropoffZoneId=3&seatsRequested=2',
    );

    expect(res.status).toBe(200);
    expect(res.body.estimate).toEqual({
      baseFarePoysha: 6000,
      distanceChargePoysha: 6400,
      poolDiscountPoysha: 0,
      totalFarePoysha: 12400,
    });
  });

  it('rejects invalid seatsRequested values with 400', async () => {
    const zero = await request(app).get(
      '/api/fare-estimate?pickupZoneId=1&dropoffZoneId=3&seatsRequested=0',
    );
    expect(zero.status).toBe(400);

    const notNumeric = await request(app).get(
      '/api/fare-estimate?pickupZoneId=1&dropoffZoneId=3&seatsRequested=abc',
    );
    expect(notNumeric.status).toBe(400);
  });

  it('rejects missing or invalid query params with 400', async () => {
    const missing = await request(app).get('/api/fare-estimate');
    expect(missing.status).toBe(400);

    const invalid = await request(app).get('/api/fare-estimate?pickupZoneId=abc&dropoffZoneId=2');
    expect(invalid.status).toBe(400);
  });

  it('rejects same or unknown zones with 400', async () => {
    const same = await request(app).get('/api/fare-estimate?pickupZoneId=1&dropoffZoneId=1');
    expect(same.status).toBe(400);

    const unknown = await request(app).get('/api/fare-estimate?pickupZoneId=1&dropoffZoneId=9999');
    expect(unknown.status).toBe(400);
  });
});
