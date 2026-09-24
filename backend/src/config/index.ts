import dotenv from 'dotenv';

dotenv.config();

// Comma-separated list of allowed browser origins, e.g.
// CORS_ORIGINS=http://localhost:3000,https://app.example.com
const rawOrigins = process.env.CORS_ORIGINS ?? '';

export const config = {
  port: Number(process.env.PORT) || 4000,
  env: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  // Default covers the local frontend dev server and the compose web container.
  corsOrigins: rawOrigins
    ? rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://localhost:3001'],
};
