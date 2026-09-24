import dotenv from 'dotenv';

// Runs in every Jest worker before any test module is imported, so the Prisma
// client (which reads DATABASE_URL at construction time) connects to the
// isolated test database rather than dev data.
dotenv.config();

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is required to run the test suite. Add it to backend/.env ' +
      '(see .env.example) and run `npm run test:setup` first.',
  );
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
