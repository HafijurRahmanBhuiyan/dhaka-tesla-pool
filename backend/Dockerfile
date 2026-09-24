# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps: install production + build/dev dependencies (needed by Prisma CLI,
# generation and the tsx-driven seed script) from the lockfile.
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
# Use development so `npm ci` installs devDependencies too: the build needs
# typescript (tsc), and the runtime needs the prisma CLI + tsx for migrate
# deploy and the seed step.
ENV NODE_ENV=development
# Prisma needs the `openssl` binary to detect the OpenSSL version and generate
# a matching query engine. Without it in the build image it falls back to
# openssl-1.1.x while the bookworm runtime ships OpenSSL 3.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Prisma client postinstall runs `prisma generate`, which needs the schema and
# prisma.config.ts present before install completes.
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

# ---------------------------------------------------------------------------
# build: compile TypeScript with the project's existing build script (tsc).
# ---------------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# runtime: slim image with compiled output, Prisma CLI/engine, seed tooling
# and the entrypoint that migrates + seeds before serving.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma engine requires OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Migrations + seed fixtures are read by the entrypoint at every startup.
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]