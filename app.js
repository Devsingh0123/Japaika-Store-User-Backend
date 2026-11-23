import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { sequelize } from './models/index.js';
import authRoutes from './routes/auth.routes.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { sendSuccess, sendError } from './utils/http.js';

const app = express();

const trustProxy = Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 1 : 0));
if (trustProxy > 0) {
  app.set('trust proxy', trustProxy);
}

app.use(helmet());
app.use(
  cors({
    origin: process.env.USER_FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/v1/health', async (_req, res) => {
  try {
    await sequelize.authenticate();
    return sendSuccess(res, {
      message: 'User backend is healthy',
      data: { service: 'user-backend', status: 'ok', database: 'connected' },
    });
  } catch {
    return sendError(res, {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database connection is unavailable.',
    });
  }
});

app.use('/api/v1/auth', authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
