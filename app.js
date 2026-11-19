import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import env from './config/env.js';
import { createApiRouter } from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';

export function createApp({
  sequelize,
  User,
  authService,
  tokenService,
  enableRateLimit = true,
} = {}) {
  const app = express();

  if (env.trustProxy > 0) {
    app.set('trust proxy', env.trustProxy);
  }

  app.use(helmet());
  app.use(
    cors({
      origin: env.userFrontendUrl,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(
    '/api/v1',
    createApiRouter({
      sequelize,
      User,
      authService,
      tokenService,
      enableRateLimit,
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
