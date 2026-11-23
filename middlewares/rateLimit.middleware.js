import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { normalizeEmail } from '../services/auth.service.js';
import { sendError } from '../utils/http.js';

function makeLimiter({ limit, message, keyGenerator }) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true',
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (_req, res) =>
      sendError(res, {
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message,
      }),
  });
}

export const requestOtpIpLimiter = makeLimiter({
  limit: 15,
  message: 'Too many OTP requests from this IP. Please try again later.',
});

export const requestOtpEmailLimiter = makeLimiter({
  limit: 5,
  message: 'Too many verification code requests for this email. Please try again later.',
  keyGenerator: (req) =>
    typeof req.body?.email === 'string' && req.body.email.trim()
      ? `otp-email:${normalizeEmail(req.body.email)}`
      : ipKeyGenerator(req.ip || ''),
});

export const verifyOtpLimiter = makeLimiter({
  limit: 10,
  message: 'Too many verification attempts. Please try again later.',
  keyGenerator: (req) => {
    const ipKey = ipKeyGenerator(req.ip || '');
    return typeof req.body?.email === 'string' && req.body.email.trim()
      ? `${ipKey}:verify:${normalizeEmail(req.body.email)}`
      : ipKey;
  },
});

export const refreshLimiter = makeLimiter({
  limit: 30,
  message: 'Too many session refresh requests. Please try again later.',
});
