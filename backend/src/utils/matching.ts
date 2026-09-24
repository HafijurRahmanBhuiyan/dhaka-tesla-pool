import { COMPATIBLE_ZONE_GROUPS } from '../config/matching';

/**
 * Two dropoff zones are compatible when they are identical or both belong to the
 * same compatible zone group (see config/matching.ts).
 */
export function areDropoffZonesCompatible(dropoffZone: string, otherDropoffZone: string): boolean {
  if (dropoffZone === otherDropoffZone) return true;

  return COMPATIBLE_ZONE_GROUPS.some(
    (group) => group.includes(dropoffZone) && group.includes(otherDropoffZone),
  );
}

interface MatchableRide {
  id: number;
  pickupZoneName: string;
  dropoffZoneName: string;
}

/**
 * Two rides can share a pool when they share the same pickup zone (grouped
 * dropoffs are evaluated via areDropoffZonesCompatible). This is the matching
 * rule documented in docs/matching-rule.md.
 */
export function areRidesCompatible(ride: MatchableRide, other: MatchableRide): boolean {
  if (ride.pickupZoneName !== other.pickupZoneName) return false;
  return areDropoffZonesCompatible(ride.dropoffZoneName, other.dropoffZoneName);
}
