import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { normalizeEmail } from '../services/otp.service.js';
import { sendError } from '../utils/response.js';

function createRateLimitHandler(message) {
  return (_req, res) =>
    sendError(res, {
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message,
    });
}

export function createAuthRateLimiters({ enabled = true } = {}) {
  const passThrough = (_req, _res, next) => next();
  if (!enabled) {
    return {
      requestOtpIpLimiter: passThrough,
      requestOtpEmailLimiter: passThrough,
      verifyOtpLimiter: passThrough,
      refreshLimiter: passThrough,
    };
  }

  const requestOtpIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: createRateLimitHandler('Too many OTP requests from this IP. Please try again later.'),
  });

  const requestOtpEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = req.body?.email;
      if (typeof email === 'string' && email.trim()) {
        return `otp-email:${normalizeEmail(email)}`;
      }
      return ipKeyGenerator(req.ip || '');
    },
    handler: createRateLimitHandler(
      'Too many verification code requests for this email. Please try again later.'
    ),
  });

  const verifyOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ipKey = ipKeyGenerator(req.ip || '');
      const email = req.body?.email;
      if (typeof email === 'string' && email.trim()) {
        return `${ipKey}:verify:${normalizeEmail(email)}`;
      }
      return ipKey;
    },
    handler: createRateLimitHandler('Too many verification attempts. Please try again later.'),
  });

  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: createRateLimitHandler('Too many session refresh requests. Please try again later.'),
  });

  return {
    requestOtpIpLimiter,
    requestOtpEmailLimiter,
    verifyOtpLimiter,
    refreshLimiter,
  };
}

export default createAuthRateLimiters;
