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

function makeRideRequest(
  token: string,
  pickupZoneId: number,
  dropoffZoneId: number,
  seatsRequested?: number,
) {
  return request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pickupZoneId,
      dropoffZoneId,
      paymentMethod: 'CASH',
      ...(seatsRequested !== undefined ? { seatsRequested } : {}),
    });
}

/** Walks a ride through a target status using the driver API (asserts 200). */
async function advanceRideTo(token: string, rideId: number, status: string) {
  const res = await request(app)
    .patch(`/api/driver/rides/${rideId}/advance`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
  expect(res.status).toBe(200);
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
      distanceChargePoysha: 2400,
      poolDiscountPoysha: 0,
      totalFarePoysha: 5400,
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
      distanceChargePoysha: 2400,
      poolDiscountPoysha: 0,
      totalFarePoysha: 5400,
    });

    // Rider B joins A's existing pool: A must get the discount too, not just B.
    const bRide = await makeRideRequest(otherPassengerToken, GULSHAN, MOKHAKALI);
    expect(bRide.status).toBe(201);
    expect(bRide.body.ride.pool.id).toBe(aRide.body.ride.pool.id);
    expect(bRide.body.ride.pool).toMatchObject({ seatsUsed: 2 });

    expect(bRide.body.ride.fare).toMatchObject({
      poolDiscountPoysha: 1000,
      totalFarePoysha: 4400,
    });

    const aReloaded = await request(app)
      .get(`/api/rides/${aRide.body.ride.id}`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(aReloaded.status).toBe(200);
    expect(aReloaded.body.ride.fare).toMatchObject({
      poolDiscountPoysha: 1000,
      totalFarePoysha: 4400,
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

  it('never pools rides headed in an incompatible direction from the same pickup', async () => {
    // Banani -> Mohakhali and Banani -> Gulshan are the PRD story's compatible
    // pair (same Central-North direction band). Banani -> Uttara heads the
    // opposite way (North), so it must never share the pool or the Tesla.
    await createDriver({
      phone: '01788888881',
      email: 'second-driver@test.dev',
      tesla: { plateNickname: 'Rocket', seatCapacity: 4 },
    });

    const south = await makeRideRequest(passengerToken, BANANI, MOKHAKALI);
    const north = await makeRideRequest(otherPassengerToken, BANANI, UTTARA);

    expect(south.status).toBe(201);
    expect(north.status).toBe(201);
    expect(north.body.ride.pool.id).not.toBe(south.body.ride.pool.id);
    expect(north.body.ride.pool.tesla.id).not.toBe(south.body.ride.pool.tesla.id);
  });

  it('rejects a 4th concurrent rider once Bullet\u2019s 3 seats are full', async () => {
    // Bullet seats 3. Three matching riders fill it; a fourth on the same
    // compatible route must be rejected with the friendly seat-race message
    // (there is no other Tesla to fall back to).
    const first = await makeRideRequest(passengerToken, BANANI, MOKHAKALI);
    const second = await makeRideRequest(otherPassengerToken, BANANI, GULSHAN);

    const thirdUser = await createPassenger({
      phone: '01799999990',
      email: 'third@test.dev',
    });
    const third = await makeRideRequest(tokenFor(thirdUser), BANANI, MOKHAKALI);

    expect(second.body.ride.pool.id).toBe(first.body.ride.pool.id);
    expect(third.body.ride.pool.id).toBe(first.body.ride.pool.id);

    const fourthUser = await createPassenger({
      phone: '01799999991',
      email: 'fourth@test.dev',
    });
    const fourth = await makeRideRequest(tokenFor(fourthUser), BANANI, GULSHAN);

    expect(fourth.status).toBe(409);
    expect(fourth.body.error).toBe('Seat no longer available. Please try again.');
  });

  it('returns 409 when every active Tesla is already busy', async () => {
    await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const res = await makeRideRequest(otherPassengerToken, DHAANMONDI, UTTARA);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No Tesla available to serve this ride');
  });

  it('never matches an offline Tesla into a new pool', async () => {
    const offline = await request(app)
      .patch('/api/driver/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ isActive: false });
    expect(offline.status).toBe(200);
    expect(offline.body.status.isActive).toBe(false);

    // The only driver is offline, so a compatible request cannot be served.
    const ride = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    expect(ride.status).toBe(409);
    expect(ride.body.error).toBe('No Tesla available to serve this ride');

    // Coming back online makes the same Tesla matchable again.
    const online = await request(app)
      .patch('/api/driver/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ isActive: true });
    expect(online.status).toBe(200);

    const matched = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    expect(matched.status).toBe(201);
    expect(matched.body.ride.pool.tesla.plateNickname).toBe('Bullet');
  });

  it('skips an offline Tesla and matches onto an online driver\u2019s Tesla', async () => {
    await createDriver({
      phone: '01788888882',
      email: 'backup-driver@test.dev',
      tesla: { plateNickname: 'Rocket', seatCapacity: 3 },
    });

    await request(app)
      .patch('/api/driver/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ isActive: false });

    const ride = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    expect(ride.status).toBe(201);
    expect(ride.body.ride.pool.tesla.plateNickname).toBe('Rocket');
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

    // Bullet now seats 3 and the first rider already holds one seat, so exactly
    // two of the six racers win a seat. The four losers lost the last-seat race
    // (a compatible-but-full pool, every Tesla busy), so they get the friendly
    // concurrency message.
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(4);
    for (const res of rejected) {
      expect(res.body.error).toBe('Seat no longer available. Please try again.');
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
      tesla: { plateNickname: 'Bullet', seatCapacity: 3 },
    });

    // Hand-calculable from the distance table: Banani->Mohakhali = 4 km,
    // Banani->Gulshan = 3 km.
    //   Nusrat: 3000 base + 4*800 (3200) - 1000 pool discount = 5200.
    //   Rafiq : 3000 base + 3*800 (2400) - 1000 pool discount = 4400.
    // Rafiq's booking response is already pooled; Nusrat's fare is recomputed
    // once Rafiq joins, seen via reload.
    expect(rafiq.body.ride.fare).toMatchObject({
      baseFarePoysha: 3000,
      distanceChargePoysha: 2400,
      poolDiscountPoysha: 1000,
      totalFarePoysha: 4400,
    });

    const nusratReloaded = await request(app)
      .get(`/api/rides/${nusrat.body.ride.id}`)
      .set('Authorization', `Bearer ${nusratToken}`);
    expect(nusratReloaded.body.ride.fare).toMatchObject({
      baseFarePoysha: 3000,
      distanceChargePoysha: 3200,
      poolDiscountPoysha: 1000,
      totalFarePoysha: 5200,
    });

    const persisted = await prisma.fare.findMany({
      where: { rideRequestId: { in: [nusrat.body.ride.id, rafiq.body.ride.id] } },
      orderBy: { rideRequestId: 'asc' },
    });
    expect(persisted.map((f) => f.totalFarePoysha)).toEqual([5200, 4400]);
  });
});

describe('POST /api/rides - multi-seat booking', () => {
  let passengerToken: string;
  let otherPassengerToken: string;

  beforeEach(async () => {
    await resetDb();
    await createDriver();
    const passenger = await createPassenger();
    const otherPassenger = await createPassenger({
      phone: '01733333330',
      email: 'other-seat@test.dev',
    });
    passengerToken = tokenFor(passenger);
    otherPassengerToken = tokenFor(otherPassenger);
  });

  it('books multiple seats in one request and scales the fare accordingly', async () => {
    // Gulshan -> Banani = 3 km (2400 distance). Two seats: (3000 + 2400) * 2.
    const res = await makeRideRequest(passengerToken, GULSHAN, BANANI, 2);

    expect(res.status).toBe(201);
    expect(res.body.ride.seatsRequested).toBe(2);
    expect(res.body.ride.pool).toMatchObject({ status: 'MATCHED', seatsUsed: 2 });
    expect(res.body.ride.fare).toMatchObject({
      baseFarePoysha: 6000,
      distanceChargePoysha: 4800,
      poolDiscountPoysha: 0,
      totalFarePoysha: 10800,
    });
  });

  it('applies the pool discount per active rider, not per seat', async () => {
    // A solo passenger booking two seats is still ONE rider: no pool discount,
    // even though two seats are taken.
    const res = await makeRideRequest(passengerToken, GULSHAN, BANANI, 2);

    expect(res.status).toBe(201);
    expect(res.body.ride.pool).toMatchObject({ seatsUsed: 2 });
    expect(res.body.ride.fare).toMatchObject({
      poolDiscountPoysha: 0,
      totalFarePoysha: 10800,
    });
  });

  it('prices a shared pool per seat for multi-seat members', async () => {
    // Rider A books 2 seats on Banani -> Mohakhali (4 km); rider B books 1 seat
    // on the compatible Banani -> Gulshan (3 km). Both are active riders, so
    // both get the pool discount, scaled by their seat counts.
    const a = await makeRideRequest(passengerToken, BANANI, MOKHAKALI, 2);
    const b = await makeRideRequest(otherPassengerToken, BANANI, GULSHAN, 1);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.ride.pool.id).toBe(a.body.ride.pool.id);
    // 2 + 1 seats on a 3-seat Bullet.
    expect(b.body.ride.pool).toMatchObject({ seatsUsed: 3 });

    // A: (3000 + 3200 - 1000) * 2 = 10400.
    expect(b.body.ride.fare).toMatchObject({
      baseFarePoysha: 3000,
      distanceChargePoysha: 2400,
      poolDiscountPoysha: 1000,
      totalFarePoysha: 4400,
    });

    const aReloaded = await request(app)
      .get(`/api/rides/${a.body.ride.id}`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(aReloaded.body.ride.fare).toMatchObject({
      baseFarePoysha: 6000,
      distanceChargePoysha: 6400,
      poolDiscountPoysha: 2000,
      totalFarePoysha: 10400,
    });
  });

  it('rejects a multi-seat request that exceeds any Tesla capacity', async () => {
    // Bullet seats 3; asking for 4 seats cannot be served by any Tesla. The
    // failed booking leaves no ride row behind, so the passenger can retry.
    const res = await makeRideRequest(passengerToken, GULSHAN, BANANI, 4);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No Tesla available to serve this ride');

    const rides = await prisma.rideRequest.count();
    expect(rides).toBe(0);

    const retry = await makeRideRequest(passengerToken, GULSHAN, BANANI, 1);
    expect(retry.status).toBe(201);
  });

  it('rejects a smaller multi-seat join once only one seat remains free', async () => {
    // Bullet seats 3: rider A holds 2 seats, leaving 1 free. A 2-seat join for
    // the same compatible route must be refused with the seat-race message.
    await makeRideRequest(passengerToken, BANANI, MOKHAKALI, 2);

    const join = await makeRideRequest(otherPassengerToken, BANANI, GULSHAN, 2);
    expect(join.status).toBe(409);
    expect(join.body.error).toBe('Seat no longer available. Please try again.');
  });

  it('accepts a multi-seat join that exactly fits the remaining seats', async () => {
    // Rider A books 1 seat, leaving 2 free; rider B grabs both with one request.
    const a = await makeRideRequest(passengerToken, BANANI, MOKHAKALI, 1);
    const b = await makeRideRequest(otherPassengerToken, BANANI, GULSHAN, 2);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.ride.pool.id).toBe(a.body.ride.pool.id);
    expect(b.body.ride.pool).toMatchObject({ seatsUsed: 3 });
  });

  it('frees all reserved seats when a multi-seat ride is cancelled', async () => {
    const a = await makeRideRequest(passengerToken, BANANI, MOKHAKALI, 2);
    const poolId = a.body.ride.pool.id;

    const cancel = await request(app)
      .patch(`/api/rides/${a.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(cancel.status).toBe(200);

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'CANCELLED', seatsUsed: 0 });
  });

  it('never overbooks seats when a multi-seat and single-seat request race', async () => {
    // Bullet seats 3; rider A takes 1 seat. Two racers compete for the last
    // two seats: one wants 2 seats, the other 1. Exactly one may win.
    await makeRideRequest(passengerToken, BANANI, MOKHAKALI, 1);

    const twoSeatUser = await createPassenger({ phone: '01744444449', email: 'race-two@test.dev' });
    const oneSeatUser = await createPassenger({ phone: '01744444448', email: 'race-one@test.dev' });

    const results = await Promise.all([
      makeRideRequest(tokenFor(twoSeatUser), BANANI, GULSHAN, 2),
      makeRideRequest(tokenFor(oneSeatUser), BANANI, GULSHAN, 1),
    ]);

    const accepted = results.filter((res) => res.status === 201);
    const rejected = results.filter((res) => res.status === 409);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].body.error).toBe('Seat no longer available. Please try again.');

    const pools = await prisma.pool.findMany({
      where: { status: 'MATCHED' },
      include: { tesla: true },
    });
    for (const pool of pools) {
      expect(pool.seatsUsed).toBeLessThanOrEqual(pool.tesla.seatCapacity);
    }
  });
});

describe('POST /api/rides - one active ride per passenger', () => {
  let passengerToken: string;
  let driverToken: string;

  beforeEach(async () => {
    await resetDb();
    const driver = await createDriver();
    const passenger = await createPassenger();
    passengerToken = tokenFor(passenger);
    driverToken = tokenFor(driver);
  });

  it('rejects a second active ride for the same passenger with 409', async () => {
    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    expect(first.status).toBe(201);

    const second = await makeRideRequest(passengerToken, DHAANMONDI, MIRPUR);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe(
      'You already have an active ride. Cancel it before requesting another.',
    );
  });

  it('allows a new ride after the passenger cancels the active one', async () => {
    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const cancel = await request(app)
      .patch(`/api/rides/${first.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(cancel.status).toBe(200);

    const second = await makeRideRequest(passengerToken, DHAANMONDI, MIRPUR);
    expect(second.status).toBe(201);
  });

  it('enforces the guard per passenger, not globally', async () => {
    const other = await createPassenger({ phone: '01766661111', email: 'other-guard@test.dev' });
    const otherToken = tokenFor(other);

    await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const second = await makeRideRequest(otherToken, GULSHAN, MOKHAKALI);
    expect(second.status).toBe(201);
  });

  it('lets the same passenger book again once a ride reaches a terminal status', async () => {
    const completed = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    for (const status of ['DRIVER_ARRIVED', 'STARTED', 'COMPLETED']) {
      await advanceRideTo(driverToken, completed.body.ride.id, status);
    }

    const again = await makeRideRequest(passengerToken, GULSHAN, MOKHAKALI);
    expect(again.status).toBe(201);
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
  let driverAToken: string;

  beforeEach(async () => {
    await resetDb();
    const driverA = await createDriver();
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
    driverAToken = tokenFor(driverA);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/rides');
    expect(res.status).toBe(401);
  });

  it('returns only the logged-in passenger\u2019s own rides, newest first', async () => {
    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    // One active ride at a time is enforced, so finish the first trip before
    // the passenger books again.
    for (const status of ['DRIVER_ARRIVED', 'STARTED', 'COMPLETED']) {
      const advanced = await request(app)
        .patch(`/api/driver/rides/${first.body.ride.id}/advance`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .send({ status });
      expect(advanced.status).toBe(200);
    }
    const second = await makeRideRequest(passengerToken, DHAANMONDI, MIRPUR);
    expect(second.status).toBe(201);

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
    expect(res.body.ride.cancelledBy).toBe('PASSENGER');
    expect(res.body.ride.cancellationReason).toBeNull();
    expect(res.body.ride.fare.cancellationFeePoysha).toBe(0);

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'CANCELLED', seatsUsed: 0 });
  });

  it('stores an optional reason when the passenger provides one', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);

    const res = await request(app)
      .patch(`/api/rides/${created.body.ride.id}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ reason: 'Plans changed' });

    expect(res.status).toBe(200);
    expect(res.body.ride.cancelledBy).toBe('PASSENGER');
    expect(res.body.ride.cancellationReason).toBe('Plans changed');
    expect(res.body.ride.fare.cancellationFeePoysha).toBe(0);
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
      totalFarePoysha: 5400,
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

  it('allows the passenger to cancel after the driver arrived, with a 10 Tk fee', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const poolId = created.body.ride.pool.id;
    const rideId = created.body.ride.id;

    const arrived = await request(app)
      .patch(`/api/driver/rides/${rideId}/advance`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'DRIVER_ARRIVED' });
    expect(arrived.body.pool.rideRequests[0].status).toBe('DRIVER_ARRIVED');

    const res = await request(app)
      .patch(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('CANCELLED');
    expect(res.body.ride.cancelledBy).toBe('PASSENGER');
    expect(res.body.ride.cancellationReason).toBeNull();
    expect(res.body.ride.fare.cancellationFeePoysha).toBe(1000);

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'CANCELLED', seatsUsed: 0 });
  });

  it('charges the DRIVER_ARRIVED fee, releases the seat, and recomputes survivor fare', async () => {
    const first = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const second = await makeRideRequest(otherPassengerToken, GULSHAN, MOKHAKALI);
    const poolId = first.body.ride.pool.id;
    const firstId = first.body.ride.id;
    const secondId = second.body.ride.id;

    // Both riders are picked up.
    await request(app)
      .patch(`/api/driver/rides/${firstId}/advance`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'DRIVER_ARRIVED' });
    await request(app)
      .patch(`/api/driver/rides/${secondId}/advance`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'DRIVER_ARRIVED' });

    const cancelRes = await request(app)
      .patch(`/api/rides/${secondId}/cancel`)
      .set('Authorization', `Bearer ${otherPassengerToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.ride.cancelledBy).toBe('PASSENGER');
    expect(cancelRes.body.ride.fare.cancellationFeePoysha).toBe(1000);

    // Seat released, pool stays open for the survivor.
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'MATCHED', seatsUsed: 1 });

    // The survivor's pool discount is gone: solo fare for Gulshan -> Banani.
    const survivor = await request(app)
      .get(`/api/rides/${firstId}`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(survivor.body.ride.fare).toMatchObject({
      poolDiscountPoysha: 0,
      totalFarePoysha: 5400,
      cancellationFeePoysha: 0,
    });
  });

  it('still rejects cancelling a STARTED ride with 409', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const poolId = created.body.ride.pool.id;
    const rideId = created.body.ride.id;

    for (const status of ['DRIVER_ARRIVED', 'STARTED']) {
      const advanced = await request(app)
        .patch(`/api/driver/rides/${rideId}/advance`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status });
      expect(advanced.status).toBe(200);
    }
    expect(
      (await prisma.rideRequest.findUnique({ where: { id: rideId } }))?.status,
    ).toBe('STARTED');

    const cancelStarted = await request(app)
      .patch(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(cancelStarted.status).toBe(409);
    expect(cancelStarted.body.error).toBe('Cannot cancel a ride in status STARTED');

    const ride = await prisma.rideRequest.findUnique({ where: { id: rideId } });
    expect(ride?.status).toBe('STARTED');
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool).toMatchObject({ status: 'MATCHED', seatsUsed: 1 });
  });

  it('rejects cancelling a COMPLETED ride with 409', async () => {
    const created = await makeRideRequest(passengerToken, GULSHAN, BANANI);
    const rideId = created.body.ride.id;

    for (const status of ['DRIVER_ARRIVED', 'STARTED', 'COMPLETED']) {
      await request(app)
        .patch(`/api/driver/rides/${rideId}/advance`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status });
    }

    const res = await request(app)
      .patch(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Cannot cancel a ride in status COMPLETED');
  });
});
