import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';
import { createAuthRouter } from './auth.routes.js';

export function createApiRouter({
  sequelize,
  User,
  authService,
  tokenService,
  enableRateLimit = true,
} = {}) {
  const router = Router();

  router.get('/health', createHealthController({ sequelize }));
  router.use('/auth', createAuthRouter({ authService, tokenService, User, enableRateLimit }));

  return router;
}

export default createApiRouter;
