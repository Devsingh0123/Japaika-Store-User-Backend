import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middlewares/validate.middleware.js';
import { createAuthRateLimiters } from '../middlewares/rateLimit.middleware.js';
import { createAuthMiddleware } from '../middlewares/auth.middleware.js';
import { createAuthController } from '../controllers/auth.controller.js';

const requestOtpSchema = z.object({
  email: z
    .string({ error: 'Email is required.' })
    .trim()
    .min(1, 'Email is required.')
    .max(255, 'Email must not exceed 255 characters.')
    .email('Please provide a valid email address.'),
});

const verifyOtpSchema = z.object({
  email: z
    .string({ error: 'Email is required.' })
    .trim()
    .min(1, 'Email is required.')
    .max(255, 'Email must not exceed 255 characters.')
    .email('Please provide a valid email address.'),
  otp: z
    .string({ error: 'Verification code is required.' })
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be a 6-digit number.'),
});

export function createAuthRouter({
  authService,
  tokenService,
  User,
  enableRateLimit = true,
} = {}) {
  const router = Router();
  const controller = createAuthController({ authService, tokenService });
  const requireCustomerAuth = createAuthMiddleware({ User, tokenService });
  const limiters = createAuthRateLimiters({ enabled: enableRateLimit });

  router.post(
    '/request-otp',
    limiters.requestOtpIpLimiter,
    validateBody(requestOtpSchema),
    limiters.requestOtpEmailLimiter,
    controller.requestOtp
  );

  router.post(
    '/verify-otp',
    validateBody(verifyOtpSchema),
    limiters.verifyOtpLimiter,
    controller.verifyOtp
  );

  router.post('/refresh', limiters.refreshLimiter, controller.refresh);

  router.post('/logout', controller.logout);

  router.post('/logout-all', requireCustomerAuth, controller.logoutAll);

  router.get('/me', requireCustomerAuth, controller.getMe);

  return router;
}

export default createAuthRouter;
