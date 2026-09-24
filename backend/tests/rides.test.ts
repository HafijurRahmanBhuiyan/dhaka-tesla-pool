import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { areRidesCompatible } from '../src/utils/matching';
import { createDriver, createPassenger, resetDb, tokenFor, ZONE } from './helpers';

const app = createApp();

const GULSHAN = ZONE.pickup.Gulshan;
const BANANI = ZONE.pickup.Banani;
const MOKHAKALI = ZONE.pickup.Mohakhali;
const DHAANMONDI = ZONE.pickup.Dhanmondi;
const MIRPUR = ZONE.pickup.Mirpur;
const UTTARA = ZONE.pickup.Uttara;

function makeRideRequest(token: string, pickupZoneId: number, dropoffZoneId: number) {
  return request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${token}`)
    .send({ pickupZoneId, dropoffZoneId, paymentMethod: 'CASH' });
}

describe('matching utils', () => {
  it('matches identical dropoffs and same-group dropoffs, rejects different routes', () => {
    expect(
      areRidesCompatible(
        { id: 1, pickupZoneName: 'Gulshan', dropoffZoneName: 'Banani' },
        { id: 2, pickupZoneName: 'Gulshan', dropoffZoneName: 'Gulshan' },
      ),
    ).toBe(true);
    expect(
      areRidesCompatible(
        { id: 1, pickupZoneName: 'Uttara', dropoffZoneName: 'Mirpur' },
        { id: 2, pickupZoneName: 'Uttara', dropoffZoneName: 'Mirpur' },
      ),
    ).toBe(true);
    expect(
      areRidesCompatible(
        { id: 1, pickupZoneName: 'Uttara', dropoffZoneName: 'Bashundhara' },
        { id: 2, pickupZoneName: 'Uttara', dropoffZoneName: 'Gulshan' },
      ),
    ).toBe(false);
  });
});

describe('POST /api/rides', () => {
  let passengerToken: string;
  let otherPassengerToken: string;
  let driverToken: string;

  beforeEach(async () => {
    await resetDb();
    const passenger = await createPassenger();
    const otherPassenger = await createPassenger({
      phone: '01733333330',
      email: 'other@test.dev',
    });
    const driver = await createDriver();
    passengerToken = tokenFor(passenger);
    otherPassengerToken = tokenFor(otherPassenger);
    driverToken = tokenFor(driver);
  });

  it('requires authentication and PASSENGER role', async () => {
    const unauth = await request(app)
      .post('/api/rides')
      .send({ pickupZoneId: GULSHAN, dropoffZoneId: BANANI });
    expect(unauth.status).toBe(401);

    const asDriver = await makeRideRequest(driverToken, GULSHAN, BANANI);
    expect(asDriver.status).toBe(403);
  });

  it('validates zones and pickup != dropoff', async () => {
    const sameZone = await makeRideRequest(passengerToken, GULSHAN, GULSHAN);
    expect(sameZone.status).toBe(400);
    expect(sameZone.body.error).toBe('Validation failed');

    const unknownZone = await makeRideRequest(passengerToken, 9999, BANANI);
    expect(unknownZone.status).toBe(400);
    expect(unknownZone.body.error).toBe('Unknown pickup or dropoff zone');
  });

  it('creates a ride, matches it instantly to a new pool, and writes a fare', async () => {
    const res = await makeRideRequest(passengerToken, GULSHAN, BANANI);

    expect(res.status).toBe(201);
    expect(res.body.ride).toMatchObject({
      status: 'MATCHED',
      pickupZone: { id: GULSHAN },
      dropoffZone: { id: BANANI },
    });
    expect(res.body.ride.pool).toMatchObject({ status: 'MATCHED', seatsUsed: 1 });
    expect(res.body.ride.fare).toMatchObject({
      baseFarePoysha: 3000,
      distanceChargePoysha: 1500,
      poolDiscountPoysha: 0,
      totalFarePoysha: 4500,
      paymentMethod: 'CASH',
    });
    expect(res.body.ride.statusHistory).toHaveLength(2);
  });

  it('pools two compatible rides into the same pool and applies the discount', async () => {
    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const second = await makeRideRequest(otherPassengerToken, GULSHAN, MOKHAKALI);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.ride.pool.id).toBe(first.body.ride.pool.id);
    expect(second.body.ride.pool).toMatchObject({ seatsUsed: 2 });
    expect(second.body.ride.fare).toMatchObject({ poolDiscountPoysha: 1000 });

    const firstReloaded = await request(app)
      .get(`/api/rides/${first.body.ride.id}`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(firstReloaded.body.ride.fare).toMatchObject({ poolDiscountPoysha: 1000 });
  });

  it('recomputes the existing rider\u2019s fare when a second rider joins the pool', async () => {
    // Rider A creates a solo pool: full fare, no pool discount yet.
    const aRide = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    expect(aRide.status).toBe(201);
    expect(aRide.body.ride.fare).toMatchObject({
      baseFarePoysha: 3000,
      distanceChargePoysha: 1500,
      poolDiscountPoysha: 0,
      totalFarePoysha: 4500,
    });

    // Rider B joins A's existing pool: A must get the discount too, not just B.
    const bRide = await makeRideRequest(otherPassengerToken, GULSHAN, MOKHAKALI);
    expect(bRide.status).toBe(201);
    expect(bRide.body.ride.pool.id).toBe(aRide.body.ride.pool.id);
    expect(bRide.body.ride.pool).toMatchObject({ seatsUsed: 2 });

    expect(bRide.body.ride.fare).toMatchObject({
      poolDiscountPoysha: 1000,
      totalFarePoysha: 3500,
    });

    const aReloaded = await request(app)
      .get(`/api/rides/${aRide.body.ride.id}`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(aReloaded.status).toBe(200);
    expect(aReloaded.body.ride.fare).toMatchObject({
      poolDiscountPoysha: 1000,
      totalFarePoysha: 3500,
    });
  });

  it('puts an incompatible route on a different Tesla', async () => {
    await createDriver({
      phone: '01788888880',
      email: 'second-driver@test.dev',
      tesla: { plateNickname: 'Rocket', seatCapacity: 3 },
    });

    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const second = await makeRideRequest(otherPassengerToken, DHAANMONDI, UTTARA);

    expect(second.status).toBe(201);
    expect(second.body.ride.pool.id).not.toBe(first.body.ride.pool.id);
    expect(second.body.ride.pool.tesla.id).not.toBe(first.body.ride.pool.tesla.id);
  });

  it('returns 409 when every active Tesla is already busy', async () => {
    await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const res = await makeRideRequest(otherPassengerToken, DHAANMONDI, UTTARA);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No Tesla available to serve this ride');
  });

  it('never overbooks a seat under concurrent last-seat demand', async () => {
    await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const tokens = [];
    for (let i = 0; i < 6; i += 1) {
      const user = await createPassenger({ phone: `0174444444${i}`, email: `race${i}@test.dev` });
      tokens.push(tokenFor(user));
    }

    const results = await Promise.all(
      tokens.map((token) => makeRideRequest(token, GULSHAN, MOKHAKALI)),
    );

    const accepted = results.filter((res) => res.status === 201);
    const rejected = results.filter((res) => res.status === 409);
    expect(accepted.length + rejected.length).toBe(6);
    for (const res of accepted) {
      expect(res.body.ride.status).toBe('MATCHED');
    }

    const pools = await prisma.pool.findMany({
      where: { status: 'MATCHED' },
      include: { tesla: true },
    });
    for (const pool of pools) {
      expect(pool.seatsUsed).toBeLessThanOrEqual(pool.tesla.seatCapacity);
    }

    // Every matched ride must be sitting in a matched pool, and vice versa.
    const matchedRides = await prisma.rideRequest.count({
      where: { status: 'MATCHED', pool: { status: 'MATCHED' } },
    });
    const seatsInMatchedPools = pools.reduce((sum, pool) => sum + pool.seatsUsed, 0);
    expect(matchedRides).toBe(accepted.length + 1);
    expect(seatsInMatchedPools).toBe(matchedRides);
  });
});

describe('PRD story: Nusrat and Rafiq share a pool on Bullet', () => {
  let nusratToken: string;
  let rafiqToken: string;

  beforeEach(async () => {
    await resetDb();
    await createDriver();
    const nusrat = await createPassenger({
      name: 'Nusrat',
      phone: '01730000002',
      email: 'nusrat@test.dev',
    });
    const rafiq = await createPassenger({
      name: 'Rafiq',
      phone: '01730000003',
      email: 'rafiq@test.dev',
    });
    nusratToken = tokenFor(nusrat);
    rafiqToken = tokenFor(rafiq);
  });

  it('pools Banani->Mohakhali and Banani->Gulshan and prices both at the story total', async () => {
    const nusrat = await makeRideRequest(nusratToken, BANANI, MOKHAKALI);
    const rafiq = await makeRideRequest(rafiqToken, BANANI, GULSHAN);

    expect(nusrat.status).toBe(201);
    expect(rafiq.status).toBe(201);

    // Same pickup (Banani), dropoffs in the same Central-North group
    // (Mohakhali + Gulshan) -> they share one pool on the first Tesla.
    expect(rafiq.body.ride.pool.id).toBe(nusrat.body.ride.pool.id);
    expect(rafiq.body.ride.pool).toMatchObject({
      status: 'MATCHED',
      seatsUsed: 2,
      tesla: { plateNickname: 'Bullet', seatCapacity: 4 },
    });

    // Hand-calculable from docs: base 3000 + 1500 (one zone hop) - 1000 pool
    // discount = 3500 for each rider. Rafiq's booking response is already
    // pooled; Nusrat's fare is recomputed once Rafiq joins, seen via reload.
    expect(rafiq.body.ride.fare).toMatchObject({
      baseFarePoysha: 3000,
      distanceChargePoysha: 1500,
      poolDiscountPoysha: 1000,
      totalFarePoysha: 3500,
    });

    const nusratReloaded = await request(app)
      .get(`/api/rides/${nusrat.body.ride.id}`)
      .set('Authorization', `Bearer ${nusratToken}`);
    expect(nusratReloaded.body.ride.fare).toMatchObject({
      baseFarePoysha: 3000,
      distanceChargePoysha: 1500,
      poolDiscountPoysha: 1000,
      totalFarePoysha: 3500,
    });

    const persisted = await prisma.fare.findMany({
      where: { rideRequestId: { in: [nusrat.body.ride.id, rafiq.body.ride.id] } },
      orderBy: { rideRequestId: 'asc' },
    });
    expect(persisted.map((f) => f.totalFarePoysha)).toEqual([3500, 3500]);
  });
});

describe('GET /api/zones', () => {
  it('returns the seeded zones ordered by name', async () => {
    await resetDb();

    const res = await request(app).get('/api/zones');

    expect(res.status).toBe(200);
    expect(res.body.zones).toHaveLength(8);
    expect(res.body.zones[0]).toEqual({ id: expect.any(Number), name: 'Banani' });
    const names = res.body.zones.map((z: { name: string }) => z.name);
    expect(names).toEqual([
      'Banani',
      'Bashundhara',
      'Dhanmondi',
      'Farmgate',
      'Gulshan',
      'Mirpur',
      'Mohakhali',
      'Uttara',
    ]);
  });
});

describe('GET /api/rides (my rides)', () => {
  let passengerToken: string;
  let otherPassengerToken: string;

  beforeEach(async () => {
    await resetDb();
    await createDriver();
    await createDriver({
      phone: '01733333330',
      email: 'ram@test.dev',
      name: 'Ram Driver',
      tesla: { plateNickname: 'Lightning', seatCapacity: 4 },
    });
    const passenger = await createPassenger();
    const other = await createPassenger({ phone: '01777777770', email: 'other-me@test.dev' });
    passengerToken = tokenFor(passenger);
    otherPassengerToken = tokenFor(other);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/rides');
    expect(res.status).toBe(401);
  });

  it('returns only the logged-in passenger\u2019s own rides, newest first', async () => {
    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const second = await makeRideRequest(passengerToken, DHAANMONDI, MIRPUR);

    const res = await request(app)
      .get('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rides).toHaveLength(2);
    expect(res.body.rides.map((r: { id: number }) => r.id)).toEqual([
      second.body.ride.id,
      first.body.ride.id,
    ]);
  });

  it('never lists another passenger\u2019s rides', async () => {
    await makeRideRequest(otherPassengerToken, GULSHAN, BANANI);

    const res = await request(app)
      .get('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rides).toEqual([]);
  });

  it('shows an empty list for a passenger with no rides', async () => {
    const res = await request(app)
      .get('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rides).toEqual([]);
  });
});

describe('GET /api/rides/:id', () => {
  let passengerToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let strangerToken: string;

  beforeEach(async () => {
    await resetDb();
    const passenger = await createPassenger();
    const driver = await createDriver();
    const otherDriver = await createDriver({
      phone: '01755555551',
      email: 'other-driver@test.dev',
      tesla: { plateNickname: 'Rocket', seatCapacity: 3 },
    });
    const stranger = await createPassenger({ phone: '01755555550', email: 'stranger@test.dev' });
    passengerToken = tokenFor(passenger);
    driverToken = tokenFor(driver);
    otherDriverToken = tokenFor(otherDriver);
    strangerToken = tokenFor(stranger);
  });

  it('lets the passenger and the serving driver view the ride', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const asPassenger = await request(app)
      .get(`/api/rides/${created.body.ride.id}`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(asPassenger.status).toBe(200);
    expect(asPassenger.body.ride.id).toBe(created.body.ride.id);

    const asDriver = await request(app)
      .get(`/api/rides/${created.body.ride.id}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(asDriver.status).toBe(200);
    expect(asDriver.body.ride.pool.tesla.id).toBe(created.body.ride.pool.tesla.id);
  });

  it('rejects unrelated users with 403 and missing rides with 404', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const asStranger = await request(app)
      .get(`/api/rides/${created.body.ride.id}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(asStranger.status).toBe(403);

    const asOtherDriver = await request(app)
      .get(`/api/rides/${created.body.ride.id}`)
      .set('Authorization', `Bearer ${otherDriverToken}`);
    expect(asOtherDriver.status).toBe(403);

    const missing = await request(app)
      .get('/api/rides/99999')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/rides/:id/cancel', () => {
  let passengerToken: string;
  let otherPassengerToken: string;
  let driverToken: string;

  beforeEach(async () => {
    await resetDb();
    const passenger = await createPassenger();
    const otherPassenger = await createPassenger({
      phone: '01766666660',
      email: 'partner@test.dev',
    });
    const driver = await createDriver();
    passengerToken = tokenFor(passenger);
    otherPassengerToken = tokenFor(otherPassenger);
    driverToken = tokenFor(driver);
  });

  it('cancels a solo ride and cancels its empty pool', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const poolId = created.body.ride.pool.id;

    const res = await request(app)
      .patch(`/api/rides/${created.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('CANCELLED');

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'CANCELLED', seatsUsed: 0 });
  });

  it('removes a rider from a shared pool and recomputes the survivor fare', async () => {
    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const second = await makeRideRequest(otherPassengerToken, GULSHAN, MOKHAKALI);
    const poolId = first.body.ride.pool.id;

    const cancelRes = await request(app)
      .patch(`/api/rides/${second.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${otherPassengerToken}`);
    expect(cancelRes.status).toBe(200);

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'MATCHED', seatsUsed: 1 });

    const survivor = await request(app)
      .get(`/api/rides/${first.body.ride.id}`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(survivor.body.ride.fare).toMatchObject({
      poolDiscountPoysha: 0,
      totalFarePoysha: 4500,
    });
  });

  it('forbids cancelling someone else\u2019s ride or as a driver', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const asOther = await request(app)
      .patch(`/api/rides/${created.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${otherPassengerToken}`);
    expect(asOther.status).toBe(403);

    const asDriver = await request(app)
      .patch(`/api/rides/${created.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(asDriver.status).toBe(403);
  });

  it('rejects a second cancel attempt', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    await request(app)
      .patch(`/api/rides/${created.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);

    const again = await request(app)
      .patch(`/api/rides/${created.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(again.status).toBe(409);
  });

  it('rejects cancelling once the driver has arrived or started the ride', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const poolId = created.body.ride.pool.id;
    const rideId = created.body.ride.id;

    const arrived = await request(app)
      .patch(`/api/driver/pools/${poolId}/advance`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({});
    expect(arrived.body.pool.status).toBe('DRIVER_ARRIVED');

    const cancelArrived = await request(app)
      .patch(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(cancelArrived.status).toBe(409);
    expect(cancelArrived.body.error).toBe('Cannot cancel a ride in status DRIVER_ARRIVED');

    const started = await request(app)
      .patch(`/api/driver/pools/${poolId}/advance`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({});
    expect(started.body.pool.status).toBe('STARTED');

    const cancelStarted = await request(app)
      .patch(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(cancelStarted.status).toBe(409);
    expect(cancelStarted.body.error).toBe('Cannot cancel a ride in status STARTED');

    const ride = await prisma.rideRequest.findUnique({ where: { id: rideId } });
    expect(ride?.status).toBe('STARTED');
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'STARTED', seatsUsed: 1 });
  });
});
