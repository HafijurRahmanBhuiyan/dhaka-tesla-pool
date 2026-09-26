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

describe('GET/PATCH /api/driver/status', () => {
  let driverAToken: string;
  let driverBToken: string;
  let passengerToken: string;
  let passengerBToken: string;

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
    passengerBToken = tokenFor(passengerB);
  });

  function getStatus(token: string) {
    return request(app).get('/api/driver/status').set('Authorization', `Bearer ${token}`);
  }

  function setStatus(token: string, isActive: boolean) {
    return request(app)
      .patch('/api/driver/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive });
  }

  function makeRide(token: string, pickupZoneId: number, dropoffZoneId: number) {
    return request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${token}`)
      .send({ pickupZoneId, dropoffZoneId, paymentMethod: 'CASH' });
  }

  it('returns the driver\u2019s current online state', async () => {
    const res = await getStatus(driverAToken);

    expect(res.status).toBe(200);
    expect(res.body.status).toMatchObject({
      teslaId: expect.any(Number),
      isActive: true,
      lastActiveAt: null,
      seatCapacity: 3,
      seatsUsed: 0,
    });
  });

  it('lets a driver go offline and back online when no ride is active', async () => {
    const offline = await setStatus(driverAToken, false);
    expect(offline.status).toBe(200);
    expect(offline.body.status).toMatchObject({ isActive: false, seatsUsed: 0 });
    expect(offline.body.status.lastActiveAt).not.toBeNull();

    const read = await getStatus(driverAToken);
    expect(read.body.status.isActive).toBe(false);

    const online = await setStatus(driverAToken, true);
    expect(online.status).toBe(200);
    expect(online.body.status).toMatchObject({ isActive: true, seatsUsed: 0 });
    expect(online.body.status.lastActiveAt).not.toBeNull();
  });

  it('reports live seat usage on the status while a pool is active', async () => {
    await makeRide(passengerToken, GULSHAN, BANANI);
    await makeRide(passengerBToken, GULSHAN, MOKHAKALI);

    const res = await getStatus(driverAToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toMatchObject({ isActive: true, seatCapacity: 3, seatsUsed: 2 });
  });

  it('refuses to go offline while a ride is active (409)', async () => {
    await makeRide(passengerToken, GULSHAN, BANANI);

    const offline = await setStatus(driverAToken, false);
    expect(offline.status).toBe(409);
    expect(offline.body.error).toBe('You have an active ride in progress');

    const read = await getStatus(driverAToken);
    expect(read.body.status.isActive).toBe(true);
  });

  it('allows going offline once every ride on the Tesla is finished', async () => {
    const ride = (await makeRide(passengerToken, GULSHAN, BANANI)).body.ride;
    for (const target of ['DRIVER_ARRIVED', 'STARTED', 'COMPLETED']) {
      await request(app)
        .patch(`/api/driver/rides/${ride.id}/advance`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .send({ status: target });
    }

    const offline = await setStatus(driverAToken, false);
    expect(offline.status).toBe(200);
    expect(offline.body.status.isActive).toBe(false);
  });

  it('only ever changes the acting driver\u2019s own Tesla', async () => {
    await setStatus(driverBToken, false);

    // Driver A's Tesla is untouched by driver B's toggle: the Tesla to operate
    // on is always resolved from the caller's token, never from the request.
    const a = await getStatus(driverAToken);
    expect(a.body.status).toMatchObject({ isActive: true });

    const b = await getStatus(driverBToken);
    expect(b.body.status.isActive).toBe(false);
  });

  it('rejects passengers (403), unauthenticated calls (401), and malformed bodies (400)', async () => {
    const asPassenger = await setStatus(passengerToken, false);
    expect(asPassenger.status).toBe(403);

    const unauthGet = await request(app).get('/api/driver/status');
    expect(unauthGet.status).toBe(401);

    const malformed = await request(app)
      .patch('/api/driver/status')
      .set('Authorization', `Bearer ${driverAToken}`)
      .send({ isActive: 'yes' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('Validation failed');
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

describe('PATCH /api/driver/rides/:rideRequestId/cancel', () => {
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

  function makeRide(token: string, pickupZoneId: number, dropoffZoneId: number) {
    return request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${token}`)
      .send({ pickupZoneId, dropoffZoneId, paymentMethod: 'CASH' });
  }

  function driverCancel(token: string, rideRequestId: number, body: object = {}) {
    return request(app)
      .patch(`/api/driver/rides/${rideRequestId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('rejects a driver cancel without a reason (400)', async () => {
    const ride = await makeRide(passengerToken, GULSHAN, BANANI);
    await request(app)
      .patch(`/api/driver/rides/${ride.body.ride.id}/advance`)
      .set('Authorization', `Bearer ${driverAToken}`)
      .send({ status: 'DRIVER_ARRIVED' });

    const res = await driverCancel(driverAToken, ride.body.ride.id, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');

    const reloaded = await prisma.rideRequest.findUnique({ where: { id: ride.body.ride.id } });
    expect(reloaded?.status).toBe('DRIVER_ARRIVED');
  });

  it('lets the driver cancel a DRIVER_ARRIVED ride with a reason and no fee', async () => {
    const ride = await makeRide(passengerToken, GULSHAN, BANANI);
    const rideId = ride.body.ride.id;
    const poolId = ride.body.ride.pool.id;

    await request(app)
      .patch(`/api/driver/rides/${rideId}/advance`)
      .set('Authorization', `Bearer ${driverAToken}`)
      .send({ status: 'DRIVER_ARRIVED' });

    const res = await driverCancel(driverAToken, rideId, { reason: 'Passenger no-show' });
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('CANCELLED');
    expect(res.body.ride.cancelledBy).toBe('DRIVER');
    expect(res.body.ride.cancellationReason).toBe('Passenger no-show');
    expect(res.body.ride.fare.cancellationFeePoysha).toBe(0);

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'CANCELLED', seatsUsed: 0 });
  });

  it('lets the driver cancel a MATCHED ride free of charge with a reason', async () => {
    const ride = await makeRide(passengerToken, GULSHAN, BANANI);

    const res = await driverCancel(driverAToken, ride.body.ride.id, {
      reason: 'Route changed',
    });
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('CANCELLED');
    expect(res.body.ride.cancelledBy).toBe('DRIVER');
    expect(res.body.ride.cancellationReason).toBe('Route changed');
    expect(res.body.ride.fare.cancellationFeePoysha).toBe(0);
  });

  it('forbids a driver from cancelling a ride on another driver\u2019s Tesla', async () => {
    const ride = await makeRide(passengerToken, GULSHAN, BANANI);
    const rideId = ride.body.ride.id;

    const res = await driverCancel(driverBToken, rideId, { reason: 'Not mine' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('This pool belongs to another driver');

    const reloaded = await prisma.rideRequest.findUnique({ where: { id: rideId } });
    expect(reloaded?.status).toBe('MATCHED');
  });

  it('rejects a driver cancel of a STARTED ride with 409', async () => {
    const ride = await makeRide(passengerToken, GULSHAN, BANANI);
    const rideId = ride.body.ride.id;

    await request(app)
      .patch(`/api/driver/rides/${rideId}/advance`)
      .set('Authorization', `Bearer ${driverAToken}`)
      .send({ status: 'DRIVER_ARRIVED' });
    await request(app)
      .patch(`/api/driver/rides/${rideId}/advance`)
      .set('Authorization', `Bearer ${driverAToken}`)
      .send({ status: 'STARTED' });

    const res = await driverCancel(driverAToken, rideId, { reason: 'Too late now' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Cannot cancel a ride in status STARTED');
  });

  it('rejects cancelling an already-cancelled ride with 409', async () => {
    const ride = await makeRide(passengerToken, GULSHAN, BANANI);
    const rideId = ride.body.ride.id;

    await driverCancel(driverAToken, rideId, { reason: 'Plans changed' });

    const again = await driverCancel(driverAToken, rideId, { reason: 'Still cancelled' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Cannot cancel a ride in status CANCELLED');
  });

  it('rejects passengers and unauthenticated calls', async () => {
    const ride = await makeRide(passengerToken, GULSHAN, BANANI);

    const asPassenger = await driverCancel(passengerToken, ride.body.ride.id, {
      reason: 'Impersonating',
    });
    expect(asPassenger.status).toBe(403);

    const unauth = await request(app)
      .patch(`/api/driver/rides/${ride.body.ride.id}/cancel`)
      .send({ reason: 'No token' });
    expect(unauth.status).toBe(401);
  });

  it('returns 404 for an unknown ride', async () => {
    const res = await driverCancel(driverAToken, 99999, { reason: 'Missing' });
    expect(res.status).toBe(404);
  });
});
