// Real-ish road distances (km) between the eight seeded Dhaka zones, keyed by
// sorted zone-name pair so the table is symmetric by construction (the key for
// Banani->Gulshan equals Gulshan->Banani).
//
// These are ESTIMATED point-to-point distances, not live-routed or traffic
// adjusted; they are used to compute a deterministic distance-based fare. See
// docs/matching-rule.md ("Fares").
const DISTANCE_KM: Record<string, number> = {
  'Banani|Bashundhara': 6,
  'Banani|Dhanmondi': 10,
  'Banani|Farmgate': 7,
  'Banani|Gulshan': 3,
  'Banani|Mirpur': 9,
  'Banani|Mohakhali': 4,
  'Banani|Uttara': 10,
  'Bashundhara|Dhanmondi': 12,
  'Bashundhara|Farmgate': 9,
  'Bashundhara|Gulshan': 4,
  'Bashundhara|Mirpur': 14,
  'Bashundhara|Mohakhali': 5,
  'Bashundhara|Uttara': 15,
  'Dhanmondi|Farmgate': 3,
  'Dhanmondi|Gulshan': 11,
  'Dhanmondi|Mirpur': 8,
  'Dhanmondi|Mohakhali': 8,
  'Dhanmondi|Uttara': 16,
  'Farmgate|Gulshan': 8,
  'Farmgate|Mirpur': 7,
  'Farmgate|Mohakhali': 5,
  'Farmgate|Uttara': 13,
  'Gulshan|Mirpur': 11,
  'Gulshan|Mohakhali': 3,
  'Gulshan|Uttara': 12,
  'Mirpur|Mohakhali': 8,
  'Mirpur|Uttara': 9,
  'Mohakhali|Uttara': 11,
};

// Fallback for unknown/unseeded zone names so a fare can always be produced.
export const UNKNOWN_DISTANCE_KM = 10;

function toKey(zoneA: string, zoneB: string): string {
  return [zoneA, zoneB].sort().join('|');
}

/**
 * Estimated road distance between two zones, in kilometers. Same zone -> 0;
 * unknown zones fall back to UNKNOWN_DISTANCE_KM so the estimate never collapses
 * to zero.
 */
export function getDistanceKm(zoneA: string, zoneB: string): number {
  if (zoneA === zoneB) return 0;
  return DISTANCE_KM[toKey(zoneA, zoneB)] ?? UNKNOWN_DISTANCE_KM;
}
