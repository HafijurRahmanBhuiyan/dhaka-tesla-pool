import {
  BASE_FARE_POYSHA,
  PER_KM_CHARGE_POYSHA,
  POOL_DISCOUNT_POYSHA,
  computeFare,
} from '../src/services/fareService';
import { getDistanceKm } from '../src/config/zoneDistance';

describe('getDistanceKm', () => {
  it('returns 0 for the same zone', () => {
    expect(getDistanceKm('Uttara', 'Uttara')).toBe(0);
    expect(getDistanceKm('Gulshan', 'Gulshan')).toBe(0);
  });

  it('returns the table distances for the PRD story routes', () => {
    expect(getDistanceKm('Banani', 'Mohakhali')).toBe(4);
    expect(getDistanceKm('Banani', 'Gulshan')).toBe(3);
    expect(getDistanceKm('Gulshan', 'Banani')).toBe(3);
  });

  it('is symmetric', () => {
    expect(getDistanceKm('Gulshan', 'Bashundhara')).toBe(4);
    expect(getDistanceKm('Bashundhara', 'Gulshan')).toBe(4);
    expect(getDistanceKm('Mirpur', 'Uttara')).toBe(9);
    expect(getDistanceKm('Uttara', 'Mirpur')).toBe(9);
  });

  it('falls back to a non-zero distance for unknown zones', () => {
    expect(getDistanceKm('UnknownZone', 'Gulshan')).toBeGreaterThan(0);
    expect(getDistanceKm('Gulshan', 'Nowhere')).toBeGreaterThan(0);
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

  it('adds a per-kilometre distance charge for a solo ride', () => {
    const fare = computeFare('Gulshan', 'Bashundhara', false);
    expect(fare.distanceChargePoysha).toBe(
      getDistanceKm('Gulshan', 'Bashundhara') * PER_KM_CHARGE_POYSHA,
    );
    expect(fare.totalFarePoysha).toBe(
      BASE_FARE_POYSHA + getDistanceKm('Gulshan', 'Bashundhara') * PER_KM_CHARGE_POYSHA,
    );
  });

  it('applies the pool discount only when pooled', () => {
    const solo = computeFare('Uttara', 'Bashundhara', false);
    const pooled = computeFare('Uttara', 'Bashundhara', true);

    expect(pooled.poolDiscountPoysha).toBe(POOL_DISCOUNT_POYSHA);
    expect(solo.poolDiscountPoysha).toBe(0);
    expect(pooled.totalFarePoysha).toBe(solo.totalFarePoysha - POOL_DISCOUNT_POYSHA);
  });

  it('never returns a negative total even on the cheapest pooled route', () => {
    const fare = computeFare('Dhanmondi', 'Farmgate', true);
    expect(fare.totalFarePoysha).toBeGreaterThanOrEqual(0);
  });

  it('multiplies base, distance, discount, and total by the seated count', () => {
    // Banani -> Mohakhali is 4 km: (3000 + 4*800) * 2 = 12400.
    const solo2 = computeFare('Banani', 'Mohakhali', false, 2);
    expect(solo2).toEqual({
      baseFarePoysha: 6000,
      distanceChargePoysha: 6400,
      poolDiscountPoysha: 0,
      totalFarePoysha: 12400,
    });

    // The pool discount is applied per seat: (3000 + 3*800 - 1000) * 2 = 8800.
    const pooled2 = computeFare('Banani', 'Gulshan', true, 2);
    expect(pooled2).toEqual({
      baseFarePoysha: 6000,
      distanceChargePoysha: 4800,
      poolDiscountPoysha: 2000,
      totalFarePoysha: 8800,
    });
  });

  it('defaults to a single seat when no seat count is given', () => {
    const single = computeFare('Gulshan', 'Bashundhara', false);
    const explicitSingle = computeFare('Gulshan', 'Bashundhara', false, 1);
    expect(single).toEqual(explicitSingle);
  });
});
