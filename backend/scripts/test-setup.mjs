#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

const tmpSql = `/tmp/dtp-test-${process.pid}.sql`;

// psql does not accept Prisma-specific URL params like ?schema=public.
const psqlUrl = (connectionUrl) => {
  const url = new URL(connectionUrl);
  url.search = '';
  return url.toString();
};

const runSql = (sql, connectionUrl) => {
  writeFileSync(tmpSql, `${sql}\n`);
  try {
    execSync(`psql "${psqlUrl(connectionUrl)}" -v ON_ERROR_STOP=1 -f "${tmpSql}"`, {
      stdio: 'inherit',
    });
  } finally {
    unlinkSync(tmpSql);
  }
};

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set. Add it to backend/.env (see .env.example).');
  process.exit(1);
}

const parsed = new URL(testUrl);
const dbName = parsed.pathname.replace(/^\//, '');
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
  console.error(`Invalid database name derived from TEST_DATABASE_URL: "${dbName}".`);
  process.exit(1);
}

const adminUrl = new URL(testUrl);
adminUrl.pathname = '/postgres';
adminUrl.search = '';
const adminPsqlUrl = adminUrl.toString();

console.log(`Setting up test database "${dbName}".`);
const exists =
  execSync(`psql "${adminPsqlUrl}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${dbName}';"`, {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim() === '1';

if (!exists) {
  runSql(`CREATE DATABASE "${dbName}";`, adminPsqlUrl);
  console.log(`Created database "${dbName}".`);
} else {
  console.log(`Database "${dbName}" already exists, reusing it.`);
}

console.log('Applying migrations ...');
execSync('npx prisma migrate deploy', {
  env: { ...process.env, DATABASE_URL: testUrl },
  stdio: 'inherit',
});

console.log('Truncating tables for a clean slate ...');
runSql(
  `TRUNCATE "Tesla", "Pool", "RideRequest", "Fare", "RideStatusHistory", "User", "Zone" RESTART IDENTITY CASCADE;`,
  testUrl,
);

console.log('Test database is ready.');
