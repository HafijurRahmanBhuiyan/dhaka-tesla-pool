#!/bin/sh
# Container entrypoint: apply migrations, seed fixtures, then start the API.
# Every step is idempotent, so this is safe to re-run on container restart.
set -e

PORT="${PORT:-4000}"

echo "[api] Applying database migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[api] Seeding database (prisma db seed)..."
npx prisma db seed

echo "[api] Starting API server on port ${PORT}..."
exec node dist/server.js