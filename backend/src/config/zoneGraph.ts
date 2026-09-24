// Undirected adjacency graph of Dhaka zones (keyed by zone NAME).
//
// Edges model realistic driving hops in Dhaka; the shortest-path hop count is
// used to compute the distance charge for a ride. Any two adjacent zones are one
// hop apart, so a graph that lets you reach any zone from any other zone keeps
// the math sane for the eight seeded zones.
export const ZONE_GRAPH: Record<string, string[]> = {
  Uttara: ['Bashundhara'],
  Bashundhara: ['Uttara', 'Gulshan'],
  Gulshan: ['Bashundhara', 'Banani', 'Mohakhali'],
  Banani: ['Gulshan', 'Mohakhali'],
  Mohakhali: ['Gulshan', 'Banani', 'Farmgate'],
  Farmgate: ['Mohakhali', 'Dhanmondi', 'Mirpur'],
  Dhanmondi: ['Farmgate', 'Mirpur'],
  Mirpur: ['Farmgate', 'Dhanmondi'],
};
