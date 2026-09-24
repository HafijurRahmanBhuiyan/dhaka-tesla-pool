import express from 'express';
import cors from 'cors';
import router from './routes';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import ridesRouter from './routes/rides';
import driverRouter from './routes/driver';
import zonesRouter from './routes/zones';
import { errorHandler, notFound } from './middlewares/error';

export const createApp = (): express.Express => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/', router);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/rides', ridesRouter);
  app.use('/api/driver', driverRouter);
  app.use('/api/zones', zonesRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
