import express from 'express';
import cors from 'cors';
import { config } from './config';
import router from './routes';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import ridesRouter from './routes/rides';
import driverRouter from './routes/driver';
import zonesRouter from './routes/zones';
import fareRouter from './routes/fare';
import { errorHandler, notFound } from './middlewares/error';

export const createApp = (): express.Express => {
  const app = express();

  // Explicit origin allowlist. Requests without an Origin header (server-to-
  // server, e.g. the Next.js BFF proxy, curl, health checks) are always
  // allowed; browser origins must be listed in CORS_ORIGINS (defaults to the
  // local dev/compose frontend ports).
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    }),
  );
  app.use(express.json());

  app.use('/', router);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/rides', ridesRouter);
  app.use('/api/driver', driverRouter);
  app.use('/api/zones', zonesRouter);
  app.use('/api/fare-estimate', fareRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
