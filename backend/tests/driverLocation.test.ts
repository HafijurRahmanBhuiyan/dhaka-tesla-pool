import request from 'supertest';
import { createApp } from '../src/app';
import { createDriver, createPassenger, resetDb, tokenFor, ZONE } from './helpers';

const app = createApp();

const BANANI = ZONE.pickup.Banani;
const GULSHAN = ZONE.pickup.Gulshan;
const UTTARA = ZONE.pickup.Uttara;

describe('Driver Location and Specific Driver Selection', () => {
  let driver: { id: number; role: string };
  let driverToken: string;
  let passenger: { id: number; role: string };
  let passengerToken: string;

  beforeEach(async () => {
    await resetDb();
    driver = await createDriver();
    driverToken = tokenFor(driver);
    passenger = await createPassenger();
    passengerToken = tokenFor(passenger);
  });

  it('allows a driver to set and get their current location', async () => {
    // Initially location may be null
    const initialRes = await request(app)
      .get('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(initialRes.status).toBe(200);

    // Driver sets location to Banani
    const updateRes = await request(app)
      .patch('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ zoneId: BANANI });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.location.name).toBe('Banani');

    // Getting location returns Banani
    const getRes = await request(app)
      .get('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.location.name).toBe('Banani');
  });

  it('lists available drivers stationed in a pickup zone with seat counts', async () => {
    // Driver sets location to Banani
    await request(app)
      .patch('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ zoneId: BANANI });

    // Passenger queries available drivers in Banani
    const res = await request(app)
      .get(`/api/driver/available?pickupZoneId=${BANANI}`)
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.drivers).toHaveLength(1);
    expect(res.body.drivers[0].id).toBe(driver.id);
    expect(res.body.drivers[0].name).toBe('Sara Driver');
    expect(res.body.drivers[0].location.name).toBe('Banani');
    expect(res.body.drivers[0].tesla.plateNickname).toBe('Bullet');
    expect(res.body.drivers[0].availableSeats).toBe(3);
    expect(res.body.drivers[0].seatsUsed).toBe(0);
    expect(res.body.drivers[0].isAvailable).toBe(true);

    // Querying an empty zone returns empty list
    const emptyRes = await request(app)
      .get(`/api/driver/available?pickupZoneId=${UTTARA}`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.drivers).toHaveLength(0);
  });

  it('routes ride request specifically to the selected driver', async () => {
    // Driver sets location to Banani
    await request(app)
      .patch('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ zoneId: BANANI });

    // Passenger creates ride requesting this specific driver
    const rideRes = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        pickupZoneId: BANANI,
        dropoffZoneId: GULSHAN,
        paymentMethod: 'CASH',
        driverId: driver.id,
      });

    expect(rideRes.status).toBe(201);
    expect(rideRes.body.ride.pool).toBeDefined();
    expect(rideRes.body.ride.pool.tesla.driverId).toBe(driver.id);
    expect(rideRes.body.ride.pool.tesla.plateNickname).toBe('Bullet');

    // Check available seats decreased
    const availableRes = await request(app)
      .get(`/api/driver/available?pickupZoneId=${BANANI}`)
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(availableRes.body.drivers[0].seatsUsed).toBe(1);
    expect(availableRes.body.drivers[0].availableSeats).toBe(2);
  });
});
