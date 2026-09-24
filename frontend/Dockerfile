# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps: install dependencies from the lockfile (postinstall needs nothing else).
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# build: compile the production bundle. NEXT_PUBLIC_API_URL is inlined at build
# time, so it is provided as a build ARG (set by docker-compose to the api
# service's in-network hostname).
# ---------------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------------------------------------------------------------------------
# runtime: slim image serving the production build with `next start`.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["npm", "run", "start"]