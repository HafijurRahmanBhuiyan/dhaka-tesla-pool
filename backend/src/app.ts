import express from 'express';
import cors from 'cors';
import router from './routes';
import { errorHandler, notFound } from './middlewares/error';

export const createApp = (): express.Express => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/', router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
