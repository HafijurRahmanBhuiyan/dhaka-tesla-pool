# Contributing

## Running tests (backend)

The auth suite uses Jest + Supertest against an **isolated test database** so
dev data is never touched.

### Prerequisites

- Local PostgreSQL running with `psql` on the PATH (used only to create the
  test database).
- `TEST_DATABASE_URL` in `backend/.env` pointing at a separate database. Copy
  from `.env.example` (e.g. `postgresql://user:password@localhost:5432/dhaka_tesla_pool_test?schema=public`).

### How the test database is set up

`npm run test:setup` (run automatically before each `npm test`) will, against
the `TEST_DATABASE_URL` database:

1. create the database if it does not exist,
2. apply all Prisma migrations (`prisma migrate deploy`), and
3. truncate all tables for a clean slate.

Jest then runs with `DATABASE_URL` pointed at the test database (overridden in
`tests/setup/env.ts`), so the app under test hits only test data.

### Running

```bash
# from the backend/ directory
npm test          # setup + full suite
npm run test:watch
```

Never point `TEST_DATABASE_URL` at your dev database — tests truncate it.

## Test Coverage

Every PRD scenario below is proven by at least one test. "File → test name"
refers to `backend/tests/`; search is a good way to jump to them.

| # | PRD scenario | Test (file → name) |
| --- | --- | --- |
| 1 | Bullet's capacity can never be exceeded | `rides.test.ts` → "never overbooks a seat under concurrent last-seat demand", "rejects a 4th concurrent rider once Bullet's 3 seats are full", and "returns 409 when every active Tesla is already busy" (all use a 3-seat "Bullet"; the race test also asserts `seatsUsed <= seatCapacity` on every open pool) |
| 2 | Invalid state transitions are rejected | `driver.test.ts` → "rejects a non-immediate transition with 409" (MATCHED→STARTED rejected), "rejects advancing a terminal ride" (COMPLETED→any rejected), "returns 404 for an unknown ride"; `rides.test.ts` → "rejects a second cancel attempt" |
| 3 | Nusrat's and Rafiq's pooled fares calculate correctly | `rides.test.ts` → "pools Banani->Mohakhali and Banani->Gulshan and prices both at the story total" (literal PRD story: base 3000 + km×800 − 1000 discount = Nusrat 5200 / Rafiq 4400); unit math in `fareService.test.ts` → `computeFare` suite; the live estimate in `fareEstimate.test.ts` |
| 4 | Users can't modify another user's ride | `rides.test.ts` → "rejects unrelated users with 403 and missing rides with 404" (stranger passenger AND non-serving driver GET = 403), "never lists another passenger's rides", "forbids cancelling someone else's ride or as a driver"; `driver.test.ts` → "never leaks another driver's pools" and "forbids advancing another driver's ride, and forbids passengers" via `PATCH /api/driver/rides/:rideRequestId/advance` |
| 5 | Cancellation rules hold | `rides.test.ts` → "cancels a solo ride and cancels its empty pool", "removes a rider from a shared pool and recomputes the survivor fare", "rejects a second cancel attempt", "rejects cancelling once the driver has arrived or started the ride" (409 in DRIVER_ARRIVED/STARTED), "forbids cancelling someone else's ride or as a driver" |
| 6 | Two concurrent requests can't corrupt pool capacity | `rides.test.ts` → "never overbooks a seat under concurrent last-seat demand" (6 parallel `POST /api/rides` via `Promise.all`; asserts the exact accept/reject split — losers get 409 "Seat no longer available. Please try again." — and every matched pool stays within capacity) |

Run the whole suite with `npm test` from `backend/`.