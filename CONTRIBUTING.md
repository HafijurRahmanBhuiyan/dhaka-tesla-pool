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