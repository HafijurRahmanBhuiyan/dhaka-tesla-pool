import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { createDriver, createPassenger, resetDb, tokenFor, ZONE } from './helpers';

const app = createApp();

const GULSHAN = ZONE.pickup.Gulshan;
const BANANI = ZONE.pickup.Banani;
const MOKHAKALI = ZONE.pickup.Mohakhali;

function makeRideRequest(
  token: string,
  pickupZoneId: number,
  dropoffZoneId: number,
  paymentMethod = 'CASH',
) {
  return request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${token}`)
    .send({ pickupZoneId, dropoffZoneId, paymentMethod });
}

function advancePool(token: string, poolId: number, status?: string) {
  const req = request(app)
    .patch(`/api/driver/pools/${poolId}/advance`)
    .set('Authorization', `Bearer ${token}`);
  return status === undefined ? req.send({}) : req.send({ status });
}

describe('GET /api/driver/pools/active', () => {
  let driverAToken: string;
  let driverBToken: string;
  let passengerToken: string;

  beforeEach(async () => {
    await resetDb();
    const driverA = await createDriver({ phone: '01711112220', email: 'driver-a@test.dev' });
    const driverB = await createDriver({ phone: '01711113330', email: 'driver-b@test.dev' });
    const passenger = await createPassenger();
    driverAToken = tokenFor(driverA);
    driverBToken = tokenFor(driverB);
    passengerToken = tokenFor(passenger);
  });

  it('returns an empty list when the driver has no active pools', async () => {
    const res = await request(app)
      .get('/api/driver/pools/active')
      .set('Authorization', `Bearer ${driverAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pools).toEqual([]);
  });

  it('returns the driver\u2019s pool with passengers, zones, and fares', async () => {
    await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const res = await request(app)
      .get('/api/driver/pools/active')
      .set('Authorization', `Bearer ${driverAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pools).toHaveLength(1);
    const pool = res.body.pools[0];
    expect(pool).toMatchObject({ status: 'MATCHED', seatsUsed: 1 });
    expect(pool.tesla.plateNickname).toBe('Bullet');
    expect(pool.rideRequests).toHaveLength(1);
    expect(pool.rideRequests[0]).toMatchObject({
      status: 'MATCHED',
      pickupZone: { id: GULSHAN, name: 'Gulshan' },
      dropoffZone: { id: BANANI, name: 'Banani' },
    });
    expect(pool.rideRequests[0].passenger.name).toBe('John Rider');
    expect(pool.rideRequests[0].fare).toMatchObject({
      totalFarePoysha: 4500,
      settled: false,
    });
  });

  it('never leaks another driver\u2019s pools', async () => {
    await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const resA = await request(app)
      .get('/api/driver/pools/active')
      .set('Authorization', `Bearer ${driverAToken}`);
    expect(resA.body.pools).toHaveLength(1);

    const resB = await request(app)
      .get('/api/driver/pools/active')
      .set('Authorization', `Bearer ${driverBToken}`);
    expect(resB.body.pools).toEqual([]);
  });

  it('rejects a passenger (requires DRIVER role)', async () => {
    const res = await request(app)
      .get('/api/driver/pools/active')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/driver/pools/:id/advance', () => {
  let driverAToken: string;
  let driverBToken: string;
  let passengerToken: string;
  let teslaPayToken: string;
  let poolId: number;

  beforeEach(async () => {
    await resetDb();
    const driverA = await createDriver({ phone: '01711112220', email: 'driver-a@test.dev' });
    const driverB = await createDriver({ phone: '01711113330', email: 'driver-b@test.dev' });
    const passenger = await createPassenger();
    const passengerB = await createPassenger({
      phone: '01711114440',
      email: 'passenger-b@test.dev',
    });
    driverAToken = tokenFor(driverA);
    driverBToken = tokenFor(driverB);
    passengerToken = tokenFor(passenger);
    teslaPayToken = tokenFor(passengerB);

    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const second = await makeRideRequest(teslaPayToken, GULSHAN, MOKHAKALI, 'TESLAPAY');
    expect(second.body.ride.pool.id).toBe(first.body.ride.pool.id);
    poolId = first.body.ride.pool.id;
  });

  it('rejects a non-immediate transition with 409', async () => {
    const res = await advancePool(driverAToken, poolId, 'STARTED');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Invalid transition from MATCHED to STARTED');

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool?.status).toBe('MATCHED');
  });

  it('advances the pool one step when no target is given', async () => {
    const res = await advancePool(driverAToken, poolId);

    expect(res.status).toBe(200);
    expect(res.body.pool.status).toBe('DRIVER_ARRIVED');
    expect(res.body.pool.startedAt).toBeNull();
  });

  it('walks the full lifecycle and updates every linked ride consistently', async () => {
    const arrived = await advancePool(driverAToken, poolId, 'DRIVER_ARRIVED');
    expect(arrived.status).toBe(200);
    expect(arrived.body.pool.status).toBe('DRIVER_ARRIVED');

    const rideIds = arrived.body.pool.rideRequests.map((r: { id: number }) => r.id);

    const history = await prisma.rideStatusHistory.findMany({
      where: { rideRequestId: { in: rideIds } },
      orderBy: { changedAt: 'asc' },
    });
    for (const rideId of rideIds) {
      const rows = history.filter((h) => h.rideRequestId === rideId);
      expect(rows).toHaveLength(3);
      expect(rows.map((h) => h.toStatus)).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED']);
    }

    const started = await advancePool(driverAToken, poolId, 'STARTED');
    expect(started.status).toBe(200);
    expect(started.body.pool.status).toBe('STARTED');
    expect(started.body.pool.startedAt).not.toBeNull();

    for (const rideId of rideIds) {
      const ride = await prisma.rideRequest.findUnique({ where: { id: rideId } });
      expect(ride?.status).toBe('STARTED');
    }

    const completed = await advancePool(driverAToken, poolId, 'COMPLETED');
    expect(completed.status).toBe(200);
    expect(completed.body.pool.status).toBe('COMPLETED');
    expect(completed.body.pool.completedAt).not.toBeNull();

    const fares = await prisma.fare.findMany({ where: { rideRequestId: { in: rideIds } } });
    const cashFare = fares.find((f) => f.paymentMethod === 'CASH');
    const teslaPayFare = fares.find((f) => f.paymentMethod === 'TESLAPAY');

    expect(cashFare).toMatchObject({ settled: true, paidAt: null });
    expect(teslaPayFare).toMatchObject({ settled: true });
    expect(teslaPayFare?.paidAt).not.toBeNull();

    for (const rideId of rideIds) {
      const ride = await prisma.rideRequest.findUnique({ where: { id: rideId } });
      expect(ride?.status).toBe('COMPLETED');
    }
  });

  it('rejects advancing a terminal pool', async () => {
    await advancePool(driverAToken, poolId, 'DRIVER_ARRIVED');
    await advancePool(driverAToken, poolId, 'STARTED');
    await advancePool(driverAToken, poolId, 'COMPLETED');

    const again = await advancePool(driverAToken, poolId, 'DRIVER_ARRIVED');
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Invalid transition from COMPLETED to DRIVER_ARRIVED');
  });

  it('forbids advancing another driver\u2019s pool, and forbids passengers', async () => {
    const asOtherDriver = await advancePool(driverBToken, poolId, 'DRIVER_ARRIVED');
    expect(asOtherDriver.status).toBe(403);
    expect(asOtherDriver.body.error).toBe('This pool belongs to another driver');

    const asPassenger = await advancePool(passengerToken, poolId, 'DRIVER_ARRIVED');
    expect(asPassenger.status).toBe(403);

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool?.status).toBe('MATCHED');
  });

  it('returns 404 for an unknown pool', async () => {
    const res = await advancePool(driverAToken, 99999, 'DRIVER_ARRIVED');
    expect(res.status).toBe(404);
  });
});
