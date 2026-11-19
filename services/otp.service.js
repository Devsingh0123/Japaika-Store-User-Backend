import crypto from 'node:crypto';
import env from '../config/env.js';

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtp(email, otp, secret = env.otp.hmacSecret) {
  const normalized = normalizeEmail(email);
  return crypto
    .createHmac('sha256', secret)
    .update(`${normalized}:${String(otp).trim()}`)
    .digest('hex');
}

export function verifyOtpHash(email, otp, expectedHash, secret = env.otp.hmacSecret) {
  if (!expectedHash || typeof expectedHash !== 'string') {
    return false;
  }

  const actualHash = hashOtp(email, otp, secret);
  const actualBuf = Buffer.from(actualHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (actualBuf.length !== expectedBuf.length || actualBuf.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export default {
  normalizeEmail,
  generateOtp,
  hashOtp,
  verifyOtpHash,
};
