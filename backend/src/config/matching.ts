// "Compatible zone groups" for ride-pooling matching.
//
// If two rides have the same pickup zone but different dropoff zones, they can
// still share a pool when both dropoffs fall inside the SAME group below
// (identical dropoffs are always compatible).
//
// The three groups cover all eight seeded Dhaka zones:
//   Group 1 "North"        : Uttara, Bashundhara        (northern suburbs)
//   Group 2 "Central-North": Gulshan, Mohakhali, Banani (CBD / diplomatic zone)
//   Group 3 "Central-West" : Dhanmondi, Farmgate, Mirpur (western inner city)
export const COMPATIBLE_ZONE_GROUPS: string[][] = [
  ['Uttara', 'Bashundhara'],
  ['Gulshan', 'Mohakhali', 'Banani'],
  ['Dhanmondi', 'Farmgate', 'Mirpur'],
];
