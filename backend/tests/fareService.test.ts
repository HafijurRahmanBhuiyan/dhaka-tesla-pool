import {
  BASE_FARE_POYSHA,
  DISTANCE_CHARGE_PER_ZONE_HOP_POYSHA,
  POOL_DISCOUNT_POYSHA,
  computeFare,
  getZoneHops,
} from '../src/services/fareService';

describe('getZoneHops', () => {
  it('returns 0 for the same zone', () => {
    expect(getZoneHops('Uttara', 'Uttara')).toBe(0);
  });

  it('returns 1 for adjacent zones', () => {
    expect(getZoneHops('Uttara', 'Bashundhara')).toBe(1);
    expect(getZoneHops('Gulshan', 'Banani')).toBe(1);
  });

  it('finds the shortest path across the zone graph', () => {
    expect(getZoneHops('Uttara', 'Gulshan')).toBe(2);
    expect(getZoneHops('Uttara', 'Banani')).toBe(3);
    expect(getZoneHops('Mirpur', 'Mohakhali')).toBe(2);
  });

  it('falls back to a single hop for unknown zones', () => {
    expect(getZoneHops('UnknownZone', 'Gulshan')).toBe(1);
    expect(getZoneHops('Gulshan', 'Nowhere')).toBe(1);
  });
});

describe('computeFare', () => {
  it('charges base fare for a same-zone solo ride', () => {
    const fare = computeFare('Uttara', 'Uttara', false);
    expect(fare).toEqual({
      baseFarePoysha: BASE_FARE_POYSHA,
      distanceChargePoysha: 0,
      poolDiscountPoysha: 0,
      totalFarePoysha: BASE_FARE_POYSHA,
    });
  });

  it('adds distance charge per hop for a solo ride', () => {
    const fare = computeFare('Bashundhara', 'Gulshan', false);
    expect(fare.distanceChargePoysha).toBe(DISTANCE_CHARGE_PER_ZONE_HOP_POYSHA);
    expect(fare.totalFarePoysha).toBe(BASE_FARE_POYSHA + DISTANCE_CHARGE_PER_ZONE_HOP_POYSHA);
  });

  it('applies the pool discount only when pooled', () => {
    const solo = computeFare('Uttara', 'Bashundhara', false);
    const pooled = computeFare('Uttara', 'Bashundhara', true);

    expect(pooled.poolDiscountPoysha).toBe(POOL_DISCOUNT_POYSHA);
    expect(solo.poolDiscountPoysha).toBe(0);
    expect(pooled.totalFarePoysha).toBe(solo.totalFarePoysha - POOL_DISCOUNT_POYSHA);
  });

  it('never returns a negative total even on the cheapest pooled route', () => {
    const fare = computeFare('Gulshan', 'Gulshan', true);
    expect(fare.totalFarePoysha).toBeGreaterThanOrEqual(0);
  });
});
