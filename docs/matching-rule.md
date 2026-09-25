# Ride-Pooling Matching Rule

This document is the source of truth for how ride requests get grouped into
pools, how each ride progresses, and how fares are priced. The matching rule is
implemented in `backend/src/services/poolService.ts`
(`findOrCreatePoolForRide`) and `backend/src/utils/matching.ts`; the ride
lifecycle is advanced per-request in `backend/src/services/driverService.ts`.

## Definitions

- A **ride** is a `RideRequest` (pickup zone, dropoff zone, passenger). Each
  ride has its **own** status (`REQUESTED -> MATCHED -> DRIVER_ARRIVED ->
  STARTED -> COMPLETED`).
- A **pool** groups rides sharing one Tesla.
- A pool is **open** when it still has at least one *active* (non-terminal)
  rider, i.e. its derived status is `MATCHED`. `Pool.status` is now a coarse,
  derived OPEN/CLOSED flag (see `backend/src/services/poolStateService.ts`),
  NOT a shared trip state: it is recomputed from the member rides and never
  gates an individual ride's own transition.
- `Pool.seatsUsed` counts the **active** members, so a completed rider's seat
  frees up immediately for a mid-trip join.

## Matching rule

A new ride (still `REQUESTED`) is assigned to the **first open pool** (ordered
by pool id) for which **both** conditions hold:

1. **Same pickup zone.** The new ride's `pickupZoneId` equals the pickup zone of
   the pool it is being matched against.
2. **Compatible dropoff.** The new ride's `dropoffZoneId` either
   - equals the existing rider's `dropoffZoneId` exactly, or
   - falls in the **same compatible zone group** as the rider's dropoff. The
     groups are defined in `backend/src/config/matching.ts`:

   | Group             | Zones                                            |
   | ----------------- | ------------------------------------------------ |
   | North             | Uttara, Bashundhara                              |
   | Central-North     | Gulshan, Mohakhali, Banani                       |
   | Central-West      | Dhanmondi, Farmgate, Mirpur                      |

The groups are **directional bands of adjacent zones**, so a single pool never
sends a driver on contradictory headings. For example, `Banani -> Mohakhali`
and `Banani -> Gulshan` (both Central-North) pool together, but `Banani ->
Mohakhali` and `Banani -> Uttara` (Central-North vs North) are **never** pooled.

If a new ride matches *any* existing rider in an open pool whose seat is free,
it joins that pool. If no open pool matches, a **new pool** is created on the
first **idle active Tesla** (a Tesla with no open pool); if every active Tesla
is busy, the request fails with `409`.

**Mid-trip joining (explicit assumption):** a Tesla can pick up additional
pooled passengers mid-trip as long as capacity and route compatibility allow it.
A passenger whose ride matches an already-`STARTED` pool joins that pool in
`MATCHED` status, and the driver advances each passenger through their own
pickup/dropoff independently.

## Ride lifecycle

Each ride is advanced per-request by the driver:

- `PATCH /api/driver/rides/:rideRequestId/advance` (body `{ status? }`; omitted
  = next forward step). The pool-level state is re-derived automatically after
  each step and only flips to `COMPLETED` once **every** rider has completed.
- Status transitions for a single ride follow `POOL_STATUS_TRANSITIONS`
  (`backend/src/config/poolTransitions.ts`); invalid jumps return `409`.
- On `COMPLETED` the ride's own fare is settled: `CASH` is marked settled,
  `TESLAPAY` additionally stamps `paidAt = now`.
- `GET /api/driver/pools/active` returns each pool with every `RideRequest`
  carrying its **own** `status`.

## Concurrency guarantees

Pool matching runs inside a single **SERIALIZABLE** transaction that locks
(`SELECT ... FOR UPDATE`) every open pool and every active Tesla. Because the
capacity check happens after acquiring those locks, two concurrent matching
requests can never overbook the same seat. The Postgres trigger
`pool_seats_used_within_capacity` enforces `0 <= seatsUsed <= seatCapacity` as a
final backstop. Serialization conflicts (`P2033`/`P2034`) are retried with a
short linear backoff.

When two riders race for the **last free seat** in a compatible pool, exactly
one wins; the loser receives the friendly message
`Seat no longer available. Please try again.` (distinct from
`No Tesla available to serve this ride`, which is used when no Tesla is free to
start a new pool for an incompatible route).

## Fares

Fares are distance-based and **estimated** — the distances in
`backend/src/config/zoneDistance.ts` are hand-tailed estimates for deterministic
hand-calculable pricing; they are not live-routed or traffic-adjusted.

- Base fare: `3000` poysha (30 BDT).
- Distance charge: `800` poysha (8 BDT) per **kilometre** (per `zoneDistance.ts`
  table; symmetric).
- Pool discount: `1000` poysha (10 BDT) subtracted when the pool has **more
  than one active rider**; zero for a solo ride. The discount is applied when a
  rider is priced and is not re-litigated when another rider later completes.
- `total = base + km * 800 - discount`, always stored as integer poysha.

Example (PRD story): Nusrat books `Banani -> Mohakhali` (4 km) and Rafiq books
`Banani -> Gulshan` (3 km) into the same pool:

- Nusrat: `3000 + 4*800 - 1000 = 5200` poysha.
- Rafiq: `3000 + 3*800 - 1000 = 4400` poysha.

Passengers can preview a **solo** estimate (no discount yet) via the public,
unauthenticated endpoint

- `GET /api/fare-estimate?pickupZoneId=<id>&dropoffZoneId=<id>`

which returns `{ estimate: { baseFarePoysha, distanceChargePoysha,
poolDiscountPoysha: 0, totalFarePoysha } }`. The frontend notes that the final
fare "may be discounted if pooled".

## Status transitions

| Transition                          | Trigger                                     |
| ----------------------------------- | ------------------------------------------- |
| `REQUESTED -> MATCHED`              | Ride assigned to a pool (`create`)          |
| `REQUESTED|MATCHED -> CANCELLED`    | Passenger cancels while ride is cancellable |
| `MATCHED -> DRIVER_ARRIVED`         | Driver taps "Mark arrived" (per ride)       |
| `DRIVER_ARRIVED -> STARTED`         | Driver taps "Start ride" (per ride)         |
| `STARTED -> COMPLETED`              | Driver taps "Complete ride" (per ride)      |

Every transition is written to `RideStatusHistory` and logged to stdout,
per-ride (never per-pool).