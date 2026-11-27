import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { sequelize } from './models/index.js';
import authRoutes from './routes/auth.routes.js';
import categoryRoutes from './routes/category.routes.js';
import productRoutes from './routes/product.routes.js';
import bannerRoutes from './routes/banner.routes.js';
import profileRoutes from './routes/profile.routes.js';
import addressRoutes from './routes/address.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import checkoutRoutes from './routes/checkout.routes.js';
import orderRoutes from './routes/order.routes.js';
import * as checkoutController from './controllers/checkout.controller.js';
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
app.use(
  express.json({
    limit: '100kb',
    verify: (req, _res, buf) => {
      if (req.originalUrl?.startsWith('/api/v1/webhooks/razorpay')) {
        req.rawBody = buf;
      }
    },
  })
);
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
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/banners', bannerRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/checkout', checkoutRoutes);
app.use('/api/v1/orders', orderRoutes);
app.post('/api/v1/webhooks/razorpay', checkoutController.handleRazorpayWebhook);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
