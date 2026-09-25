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

function advanceRide(token: string, rideRequestId: number, status?: string) {
  const req = request(app)
    .patch(`/api/driver/rides/${rideRequestId}/advance`)
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
      totalFarePoysha: 5400,
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

describe('PATCH /api/driver/rides/:rideRequestId/advance', () => {
  let driverAToken: string;
  let driverBToken: string;
  let passengerToken: string;
  let teslaPayToken: string;
  let poolId: number;
  let firstRideId: number;
  let secondRideId: number;

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
    firstRideId = first.body.ride.id;
    secondRideId = second.body.ride.id;
  });

  it('rejects a non-immediate transition with 409', async () => {
    const res = await advanceRide(driverAToken, firstRideId, 'STARTED');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Invalid transition from MATCHED to STARTED');

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool?.status).toBe('MATCHED');
  });

  it('advances just one ride one step when no target is given', async () => {
    const res = await advanceRide(driverAToken, firstRideId);

    expect(res.status).toBe(200);
    expect(res.body.pool.rideRequests[0].status).toBe('DRIVER_ARRIVED');
    // The second rider is untouched.
    expect(res.body.pool.rideRequests[1].status).toBe('MATCHED');
    // The pool-level state is only derived and stays OUTER 'MATCHED' (open).
    expect(res.body.pool.status).toBe('MATCHED');
    expect(res.body.pool.startedAt).toBeNull();
  });

  it('walks each ride through its own lifecycle independently', async () => {
    // Rider 1 (CASH) is fully finished first...
    const arrived = await advanceRide(driverAToken, firstRideId, 'DRIVER_ARRIVED');
    expect(arrived.status).toBe(200);
    expect(arrived.body.pool.rideRequests[0].status).toBe('DRIVER_ARRIVED');

    const started = await advanceRide(driverAToken, firstRideId, 'STARTED');
    expect(started.status).toBe(200);
    expect(started.body.pool.startedAt).not.toBeNull();
    expect(started.body.pool.rideRequests[0].status).toBe('STARTED');

    const completed = await advanceRide(driverAToken, firstRideId, 'COMPLETED');
    expect(completed.status).toBe(200);
    expect(completed.body.pool.rideRequests[0].status).toBe('COMPLETED');
    // ...while rider 2 has not moved and the pool stays open.
    expect(completed.body.pool.rideRequests[1].status).toBe('MATCHED');
    expect(completed.body.pool.status).toBe('MATCHED');

    // Now rider 2 completes too; only then does the pool CLOSE.
    await advanceRide(driverAToken, secondRideId, 'DRIVER_ARRIVED');
    await advanceRide(driverAToken, secondRideId, 'STARTED');
    const finished = await advanceRide(driverAToken, secondRideId, 'COMPLETED');
    expect(finished.body.pool.status).toBe('COMPLETED');
    expect(finished.body.pool.completedAt).not.toBeNull();

    const rideIds = [firstRideId, secondRideId];
    const history = await prisma.rideStatusHistory.findMany({
      where: { rideRequestId: { in: rideIds } },
      orderBy: { changedAt: 'asc' },
    });
    for (const rideId of rideIds) {
      const rows = history.filter((h) => h.rideRequestId === rideId);
      expect(rows).toHaveLength(5);
      expect(rows.map((h) => h.toStatus)).toEqual([
        'REQUESTED',
        'MATCHED',
        'DRIVER_ARRIVED',
        'STARTED',
        'COMPLETED',
      ]);
    }

    const fares = await prisma.fare.findMany({ where: { rideRequestId: { in: rideIds } } });
    const cashFare = fares.find((f) => f.paymentMethod === 'CASH');
    const teslaPayFare = fares.find((f) => f.paymentMethod === 'TESLAPAY');

    expect(cashFare).toMatchObject({ settled: true, paidAt: null });
    expect(teslaPayFare).toMatchObject({ settled: true });
    expect(teslaPayFare?.paidAt).not.toBeNull();

    const rides = await prisma.rideRequest.findMany({ where: { id: { in: rideIds } } });
    for (const ride of rides) {
      expect(ride.status).toBe('COMPLETED');
    }
  });

  it('rejects advancing a terminal ride', async () => {
    await advanceRide(driverAToken, firstRideId, 'DRIVER_ARRIVED');
    await advanceRide(driverAToken, firstRideId, 'STARTED');
    await advanceRide(driverAToken, firstRideId, 'COMPLETED');

    const again = await advanceRide(driverAToken, firstRideId, 'DRIVER_ARRIVED');
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Invalid transition from COMPLETED to DRIVER_ARRIVED');
  });

  it('forbids advancing another driver\u2019s ride, and forbids passengers', async () => {
    const asOtherDriver = await advanceRide(driverBToken, firstRideId, 'DRIVER_ARRIVED');
    expect(asOtherDriver.status).toBe(403);
    expect(asOtherDriver.body.error).toBe('This pool belongs to another driver');

    const asPassenger = await advanceRide(passengerToken, firstRideId, 'DRIVER_ARRIVED');
    expect(asPassenger.status).toBe(403);

    const ride = await prisma.rideRequest.findUnique({ where: { id: firstRideId } });
    expect(ride?.status).toBe('MATCHED');
  });

  it('returns 404 for an unknown ride', async () => {
    const res = await advanceRide(driverAToken, 99999, 'DRIVER_ARRIVED');
    expect(res.status).toBe(404);
  });
});
