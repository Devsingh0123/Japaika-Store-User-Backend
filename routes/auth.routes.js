import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middlewares/validate.middleware.js';
import {
  requestOtpIpLimiter,
  requestOtpEmailLimiter,
  verifyOtpLimiter,
  refreshLimiter,
} from '../middlewares/rateLimit.middleware.js';
import requireCustomerAuth from '../middlewares/auth.middleware.js';
import * as authController from '../controllers/auth.controller.js';

const emailField = z
  .string({ error: 'Email is required.' })
  .trim()
  .min(1, 'Email is required.')
  .max(255, 'Email must not exceed 255 characters.')
  .email('Please provide a valid email address.');

const requestOtpSchema = z.object({ email: emailField });

const verifyOtpSchema = z.object({
  email: emailField,
  otp: z
    .string({ error: 'Verification code is required.' })
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be a 6-digit number.'),
});

const router = Router();

router.post(
  '/request-otp',
  requestOtpIpLimiter,
  validateBody(requestOtpSchema),
  requestOtpEmailLimiter,
  authController.requestOtp
);
router.post('/verify-otp', validateBody(verifyOtpSchema), verifyOtpLimiter, authController.verifyOtp);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all', requireCustomerAuth, authController.logoutAll);
router.get('/me', requireCustomerAuth, authController.getMe);

export default router;
