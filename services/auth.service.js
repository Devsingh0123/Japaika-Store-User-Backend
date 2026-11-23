import crypto from 'node:crypto';
import { sequelize, User, UserOtp, UserRefreshToken } from '../models/index.js';
import {
  getRefreshMaxAgeMs,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './token.service.js';
import emailService from './email.service.js';
import { AppError } from '../utils/http.js';

const DEV_OTP_HMAC_SECRET = 'dev_only_otp_hmac_secret_replace_in_production_32';
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

// --- OTP Helpers ---

export function getOtpHmacSecret(raw = process.env) {
  const isProd = raw.NODE_ENV === 'production';
  const secret = raw.OTP_HMAC_SECRET || (isProd ? '' : DEV_OTP_HMAC_SECRET);

  if (secret.length < 32) {
    throw new Error('OTP_HMAC_SECRET must be at least 32 characters.');
  }

  if (
    isProd &&
    (secret === DEV_OTP_HMAC_SECRET || secret === 'change_me_otp_hmac_secret_min_32_chars_long')
  ) {
    throw new Error('Production requires a custom OTP_HMAC_SECRET.');
  }

  return secret;
}

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtp(email, otp, secret = getOtpHmacSecret()) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${normalizeEmail(email)}:${String(otp).trim()}`)
    .digest('hex');
}

export function verifyOtpHash(email, otp, expectedHash, secret = getOtpHmacSecret()) {
  if (!expectedHash || typeof expectedHash !== 'string') return false;

  const actualBuf = Buffer.from(hashOtp(email, otp, secret), 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  return actualBuf.length > 0 && actualBuf.length === expectedBuf.length && crypto.timingSafeEqual(actualBuf, expectedBuf);
}

// --- Internal Helpers ---

export function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName ?? null,
    phone: user.phone ?? null,
    isEmailVerified: Boolean(user.isEmailVerified),
    status: user.status,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.created_at ?? user.createdAt ?? null,
  };
}

function revokeTokenFamily(familyId, transaction) {
  return UserRefreshToken.update(
    { revokedAt: new Date() },
    { where: { familyId, revokedAt: null }, transaction }
  );
}

const cleanIp = (ip) => (ip ? String(ip).slice(0, 45) : null);
const cleanUa = (ua) => (ua ? String(ua).slice(0, 255) : null);

// --- Core Auth Flows ---

export async function requestOtp({ email, ipAddress = null, userAgent = null }) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();
  const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;

  const latestOtp = await UserOtp.findOne({
    where: { email: normalizedEmail, purpose: 'login' },
    order: [['created_at', 'DESC']],
  });

  if (latestOtp) {
    const elapsedMs = now.getTime() - new Date(latestOtp.created_at ?? latestOtp.createdAt).getTime();
    if (elapsedMs < cooldownMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000));
      throw new AppError(
        429,
        'OTP_COOLDOWN_ACTIVE',
        `Please wait ${retryAfterSeconds} seconds before requesting another verification code.`,
        [{ field: 'retryAfterSeconds', retryAfterSeconds }]
      );
    }
  }

  const otp = generateOtp();
  const otpId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await sequelize.transaction(async (transaction) => {
    await UserOtp.update(
      { consumedAt: now },
      { where: { email: normalizedEmail, purpose: 'login', consumedAt: null }, transaction }
    );

    await UserOtp.create(
      {
        id: otpId,
        email: normalizedEmail,
        otpHash: hashOtp(normalizedEmail, otp),
        purpose: 'login',
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt,
        ipAddress: cleanIp(ipAddress),
        userAgent: cleanUa(userAgent),
      },
      { transaction }
    );
  });

  try {
    await emailService.sendOtpEmail({
      to: normalizedEmail,
      otp,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
  } catch {
    await UserOtp.destroy({ where: { id: otpId } });
    throw new AppError(
      503,
      'EMAIL_DELIVERY_FAILED',
      'Unable to send verification code right now. Please try again shortly.'
    );
  }

  return {
    email: normalizedEmail,
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
}

export async function verifyOtp({ email, otp, ipAddress = null, userAgent = null }) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  const otpRecord = await UserOtp.findOne({
    where: { email: normalizedEmail, purpose: 'login', consumedAt: null },
    order: [['created_at', 'DESC']],
  });

  if (!otpRecord || new Date(otpRecord.expiresAt).getTime() <= now.getTime()) {
    throw new AppError(401, 'OTP_EXPIRED', 'Verification code has expired or is no longer valid. Please request a new code.');
  }

  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    await UserOtp.update({ consumedAt: now }, { where: { id: otpRecord.id } });
    throw new AppError(401, 'OTP_MAX_ATTEMPTS_EXCEEDED', 'Maximum verification attempts exceeded. Please request a new code.');
  }

  if (!verifyOtpHash(normalizedEmail, otp, otpRecord.otpHash)) {
    const nextAttempts = otpRecord.attempts + 1;
    if (nextAttempts >= otpRecord.maxAttempts) {
      await UserOtp.update({ attempts: nextAttempts, consumedAt: now }, { where: { id: otpRecord.id } });
      throw new AppError(401, 'OTP_MAX_ATTEMPTS_EXCEEDED', 'Maximum verification attempts exceeded. Please request a new code.');
    }

    await UserOtp.update({ attempts: nextAttempts }, { where: { id: otpRecord.id } });
    throw new AppError(401, 'INVALID_OTP', 'Invalid verification code.', [
      { remainingAttempts: otpRecord.maxAttempts - nextAttempts },
    ]);
  }

  const { user, isNewUser, refreshToken } = await sequelize.transaction(async (transaction) => {
    const [consumedCount] = await UserOtp.update(
      { consumedAt: now },
      { where: { id: otpRecord.id, consumedAt: null }, transaction }
    );

    if (consumedCount === 0) {
      throw new AppError(401, 'OTP_EXPIRED', 'Verification code has already been used. Please request a new code.');
    }

    let existingUser = await User.findOne({ where: { email: normalizedEmail }, transaction });
    let created = false;

    if (existingUser) {
      if (existingUser.status !== 'active') {
        throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact support.');
      }
      await existingUser.update({ isEmailVerified: true, lastLoginAt: now }, { transaction });
    } else {
      created = true;
      existingUser = await User.create(
        {
          id: crypto.randomUUID(),
          email: normalizedEmail,
          isEmailVerified: true,
          status: 'active',
          lastLoginAt: now,
        },
        { transaction }
      );
    }

    const tokenId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    const signedRefresh = signRefreshToken({ userId: existingUser.id, tokenId, familyId });

    await UserRefreshToken.create(
      {
        id: tokenId,
        userId: existingUser.id,
        tokenHash: hashToken(signedRefresh),
        familyId,
        expiresAt: new Date(now.getTime() + getRefreshMaxAgeMs()),
        ipAddress: cleanIp(ipAddress),
        userAgent: cleanUa(userAgent),
      },
      { transaction }
    );

    return { user: existingUser, isNewUser: created, refreshToken: signedRefresh };
  });

  return {
    user: sanitizeUser(user),
    isNewUser,
    accessToken: signAccessToken(user),
    refreshToken,
  };
}

export async function refreshSession({ refreshToken, ipAddress = null, userAgent = null }) {
  if (!refreshToken) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is missing.');
  }

  verifyRefreshToken(refreshToken);

  const tokenRecord = await UserRefreshToken.findOne({ where: { tokenHash: hashToken(refreshToken) } });
  if (!tokenRecord) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid.');
  }

  if (tokenRecord.revokedAt) {
    await revokeTokenFamily(tokenRecord.familyId);
    throw new AppError(401, 'REFRESH_TOKEN_REUSE_DETECTED', 'Session invalidated due to token reuse. Please sign in again.');
  }

  const now = new Date();
  if (new Date(tokenRecord.expiresAt).getTime() <= now.getTime()) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has expired. Please sign in again.');
  }

  const user = await User.findByPk(tokenRecord.userId);
  if (!user) {
    await revokeTokenFamily(tokenRecord.familyId);
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Customer account not found.');
  }

  if (user.status !== 'active') {
    await revokeTokenFamily(tokenRecord.familyId);
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact support.');
  }

  const newRefreshToken = await sequelize.transaction(async (transaction) => {
    const newTokenId = crypto.randomUUID();
    const signedRefresh = signRefreshToken({
      userId: user.id,
      tokenId: newTokenId,
      familyId: tokenRecord.familyId,
    });

    await UserRefreshToken.create(
      {
        id: newTokenId,
        userId: user.id,
        tokenHash: hashToken(signedRefresh),
        familyId: tokenRecord.familyId,
        expiresAt: new Date(now.getTime() + getRefreshMaxAgeMs()),
        ipAddress: cleanIp(ipAddress),
        userAgent: cleanUa(userAgent),
      },
      { transaction }
    );

    const [revokedCount] = await UserRefreshToken.update(
      { revokedAt: now, replacedByTokenId: newTokenId },
      { where: { id: tokenRecord.id, revokedAt: null }, transaction }
    );

    if (revokedCount === 0) {
      await revokeTokenFamily(tokenRecord.familyId, transaction);
      throw new AppError(401, 'REFRESH_TOKEN_REUSE_DETECTED', 'Session invalidated due to concurrent token reuse. Please sign in again.');
    }

    return signedRefresh;
  });

  return {
    user: sanitizeUser(user),
    accessToken: signAccessToken(user),
    refreshToken: newRefreshToken,
  };
}

export async function logout({ refreshToken }) {
  if (!refreshToken) return;
  await UserRefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash: hashToken(refreshToken), revokedAt: null } }
  );
}

export async function logoutAll({ userId }) {
  await UserRefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null } }
  );
}

export async function getCurrentUser({ userId }) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
  }
  if (user.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact support.');
  }
  return sanitizeUser(user);
}
