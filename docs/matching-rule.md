# Ride-Pooling Matching Rule

This document is the source of truth for how ride requests get grouped into
pools. The rule is implemented in `backend/src/services/poolService.ts`
(`findOrCreatePoolForRide`) and `backend/src/utils/matching.ts`.

## Definitions

- A **ride** is a `RideRequest` (pickup zone, dropoff zone, passenger).
- A **pool** is a group of rides currently sharing one Tesla.
- A pool is **open** when its status is `MATCHED`, its Tesla is active, and it
  has at least one free seat (`seatsUsed < seatCapacity`).

## Matching rule

A new ride (still `REQUESTED`) is assigned to the **first open pool** (ordered
by pool id) for which **both** conditions hold:

1. **Same pickup zone.** The new ride's `pickupZoneId` equals the pickup zone of
   every existing rider it is being matched against.
2. **Compatible dropoff.** The new ride's `dropoffZoneId` either
   - equals the existing rider's `dropoffZoneId` exactly, or
   - falls in the **same compatible zone group** as the rider's dropoff. The
     groups are defined in `backend/src/config/matching.ts`:

   | Group             | Zones                                            |
   | ----------------- | ------------------------------------------------ |
   | North             | Uttara, Bashundhara                              |
   | Central-North     | Gulshan, Mohakhali, Banani                       |
   | Central-West      | Dhanmondi, Farmgate, Mirpur                      |

If a new ride matches *any* existing rider in an open pool, it joins that pool.
If no open pool matches, a **new pool** is created on the **first idle active
Tesla** (a Tesla with no open pool); if every active Tesla already has an open
pool, the request fails with `409` (no capacity to serve a new pool).

## Concurrency guarantees

Pool matching runs inside a single **SERIALIZABLE** transaction that locks
(`SELECT ... FOR UPDATE`) every open pool and every active Tesla. Because the
capacity check happens after acquiring those locks, two concurrent matching
requests can never overbook the same seat. The Postgres trigger
`pool_seats_used_within_capacity` enforces `0 <= seatsUsed <= seatCapacity` as a
final backstop. Serialization conflicts (`P2033`/`P2034`) are retried with a
short linear backoff.

## Fares

- Base fare: `3000` poysha (30 BDT).
- Distance charge: `1500` poysha (15 BDT) per graph hop between pickup and
  dropoff (shortest path, BFS, `backend/src/config/zoneGraph.ts`).
- Pool discount: `1000` poysha (10 BDT) subtracted when the pool has **more
  than one active rider**; zero for a solo ride.
- `total = base + distance - discount`, always stored as integer poysha.

## Status transitions

| Transition                     | Trigger                                            |
| ------------------------------ | -------------------------------------------------- |
| `REQUESTED -> MATCHED`         | Ride assigned to a pool (`create`)                 |
| `REQUESTED|MATCHED -> CANCELLED` | Passenger cancels while ride is cancellable     |

Every transition is written to `RideStatusHistory` and logged to stdout.