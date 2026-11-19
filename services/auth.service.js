import crypto from 'node:crypto';
import env from '../config/env.js';
import { sequelize as defaultSequelize, User as DefaultUser, UserOtp as DefaultUserOtp, UserRefreshToken as DefaultUserRefreshToken } from '../models/index.js';
import defaultOtpService from './otp.service.js';
import defaultTokenService from './token.service.js';
import defaultEmailService from './email.service.js';
import AppError from '../utils/appError.js';

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

function truncateUserAgent(userAgent) {
  if (!userAgent) return null;
  return String(userAgent).slice(0, 255);
}

export function createAuthService({
  sequelize = defaultSequelize,
  User = DefaultUser,
  UserOtp = DefaultUserOtp,
  UserRefreshToken = DefaultUserRefreshToken,
  otpService = defaultOtpService,
  tokenService = defaultTokenService,
  emailService = defaultEmailService,
  otpConfig = env.otp,
} = {}) {
  async function requestOtp({ email, ipAddress = null, userAgent = null }) {
    const normalizedEmail = otpService.normalizeEmail(email);
    const now = new Date();
    const cooldownMs = otpConfig.resendCooldownSeconds * 1000;

    const latestOtp = await UserOtp.findOne({
      where: {
        email: normalizedEmail,
        purpose: 'login',
      },
      order: [['created_at', 'DESC']],
    });

    if (latestOtp) {
      const createdAtMs = new Date(latestOtp.created_at ?? latestOtp.createdAt).getTime();
      const elapsedMs = now.getTime() - createdAtMs;
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

    const otp = otpService.generateOtp();
    const otpHash = otpService.hashOtp(normalizedEmail, otp);
    const expiresAt = new Date(now.getTime() + otpConfig.expiryMinutes * 60 * 1000);
    const otpId = crypto.randomUUID();

    await sequelize.transaction(async (transaction) => {
      await UserOtp.update(
        { consumedAt: now },
        {
          where: {
            email: normalizedEmail,
            purpose: 'login',
            consumedAt: null,
          },
          transaction,
        }
      );

      await UserOtp.create(
        {
          id: otpId,
          email: normalizedEmail,
          otpHash,
          purpose: 'login',
          attempts: 0,
          maxAttempts: otpConfig.maxAttempts,
          expiresAt,
          ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
          userAgent: truncateUserAgent(userAgent),
        },
        { transaction }
      );
    });

    try {
      await emailService.sendOtpEmail({
        to: normalizedEmail,
        otp,
        expiresInMinutes: otpConfig.expiryMinutes,
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
      expiresInSeconds: otpConfig.expiryMinutes * 60,
      resendCooldownSeconds: otpConfig.resendCooldownSeconds,
    };
  }

  async function verifyOtp({ email, otp, ipAddress = null, userAgent = null }) {
    const normalizedEmail = otpService.normalizeEmail(email);
    const now = new Date();

    const otpRecord = await UserOtp.findOne({
      where: {
        email: normalizedEmail,
        purpose: 'login',
        consumedAt: null,
      },
      order: [['created_at', 'DESC']],
    });

    if (!otpRecord || new Date(otpRecord.expiresAt).getTime() <= now.getTime()) {
      throw new AppError(
        401,
        'OTP_EXPIRED',
        'Verification code has expired or is no longer valid. Please request a new code.'
      );
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      await UserOtp.update({ consumedAt: now }, { where: { id: otpRecord.id } });
      throw new AppError(
        401,
        'OTP_MAX_ATTEMPTS_EXCEEDED',
        'Maximum verification attempts exceeded. Please request a new code.'
      );
    }

    const isValidOtp = otpService.verifyOtpHash(normalizedEmail, otp, otpRecord.otpHash);

    if (!isValidOtp) {
      const nextAttempts = otpRecord.attempts + 1;
      if (nextAttempts >= otpRecord.maxAttempts) {
        await UserOtp.update(
          { attempts: nextAttempts, consumedAt: now },
          { where: { id: otpRecord.id } }
        );
        throw new AppError(
          401,
          'OTP_MAX_ATTEMPTS_EXCEEDED',
          'Maximum verification attempts exceeded. Please request a new code.'
        );
      }

      await UserOtp.update({ attempts: nextAttempts }, { where: { id: otpRecord.id } });
      throw new AppError(401, 'INVALID_OTP', 'Invalid verification code.', [
        { remainingAttempts: otpRecord.maxAttempts - nextAttempts },
      ]);
    }

    const result = await sequelize.transaction(async (transaction) => {
      const [consumedCount] = await UserOtp.update(
        { consumedAt: now },
        {
          where: {
            id: otpRecord.id,
            consumedAt: null,
          },
          transaction,
        }
      );

      if (consumedCount === 0) {
        throw new AppError(
          401,
          'OTP_EXPIRED',
          'Verification code has already been used. Please request a new code.'
        );
      }

      let user = await User.findOne({
        where: { email: normalizedEmail },
        transaction,
      });

      let isNewUser = false;

      if (user) {
        if (user.status !== 'active') {
          throw new AppError(
            403,
            'ACCOUNT_SUSPENDED',
            'Your account has been suspended. Please contact support.'
          );
        }

        await user.update(
          {
            isEmailVerified: true,
            lastLoginAt: now,
          },
          { transaction }
        );
      } else {
        isNewUser = true;
        user = await User.create(
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
      const refreshToken = tokenService.signRefreshToken({
        userId: user.id,
        tokenId,
        familyId,
      });
      const refreshExpiresAt = new Date(now.getTime() + tokenService.getRefreshMaxAgeMs());

      await UserRefreshToken.create(
        {
          id: tokenId,
          userId: user.id,
          tokenHash: tokenService.hashToken(refreshToken),
          familyId,
          expiresAt: refreshExpiresAt,
          ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
          userAgent: truncateUserAgent(userAgent),
        },
        { transaction }
      );

      return { user, isNewUser, refreshToken };
    });

    const accessToken = tokenService.signAccessToken(result.user);

    return {
      user: sanitizeUser(result.user),
      isNewUser: result.isNewUser,
      accessToken,
      refreshToken: result.refreshToken,
    };
  }

  async function refreshSession({ refreshToken, ipAddress = null, userAgent = null }) {
    if (!refreshToken) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is missing.');
    }

    tokenService.verifyRefreshToken(refreshToken);

    const tokenHash = tokenService.hashToken(refreshToken);
    const now = new Date();

    const tokenRecord = await UserRefreshToken.findOne({
      where: { tokenHash },
    });

    if (!tokenRecord) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid.');
    }

    if (tokenRecord.revokedAt) {
      await UserRefreshToken.update(
        { revokedAt: now },
        {
          where: {
            familyId: tokenRecord.familyId,
            revokedAt: null,
          },
        }
      );

      throw new AppError(
        401,
        'REFRESH_TOKEN_REUSE_DETECTED',
        'Session invalidated due to token reuse. Please sign in again.'
      );
    }

    if (new Date(tokenRecord.expiresAt).getTime() <= now.getTime()) {
      throw new AppError(
        401,
        'INVALID_REFRESH_TOKEN',
        'Refresh token has expired. Please sign in again.'
      );
    }

    const user = await User.findByPk(tokenRecord.userId);

    if (!user) {
      await UserRefreshToken.update(
        { revokedAt: now },
        {
          where: {
            familyId: tokenRecord.familyId,
            revokedAt: null,
          },
        }
      );
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Customer account not found.');
    }

    if (user.status !== 'active') {
      await UserRefreshToken.update(
        { revokedAt: now },
        {
          where: {
            familyId: tokenRecord.familyId,
            revokedAt: null,
          },
        }
      );
      throw new AppError(
        403,
        'ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact support.'
      );
    }

    const newRefreshToken = await sequelize.transaction(async (transaction) => {
      const newTokenId = crypto.randomUUID();
      const signedRefreshToken = tokenService.signRefreshToken({
        userId: user.id,
        tokenId: newTokenId,
        familyId: tokenRecord.familyId,
      });
      const refreshExpiresAt = new Date(now.getTime() + tokenService.getRefreshMaxAgeMs());

      await UserRefreshToken.create(
        {
          id: newTokenId,
          userId: user.id,
          tokenHash: tokenService.hashToken(signedRefreshToken),
          familyId: tokenRecord.familyId,
          expiresAt: refreshExpiresAt,
          ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
          userAgent: truncateUserAgent(userAgent),
        },
        { transaction }
      );

      const [revokedCount] = await UserRefreshToken.update(
        {
          revokedAt: now,
          replacedByTokenId: newTokenId,
        },
        {
          where: {
            id: tokenRecord.id,
            revokedAt: null,
          },
          transaction,
        }
      );

      if (revokedCount === 0) {
        await UserRefreshToken.update(
          { revokedAt: now },
          {
            where: {
              familyId: tokenRecord.familyId,
              revokedAt: null,
            },
            transaction,
          }
        );
        throw new AppError(
          401,
          'REFRESH_TOKEN_REUSE_DETECTED',
          'Session invalidated due to concurrent token reuse. Please sign in again.'
        );
      }

      return signedRefreshToken;
    });

    const accessToken = tokenService.signAccessToken(user);

    return {
      user: sanitizeUser(user),
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async function logout({ refreshToken }) {
    if (!refreshToken) {
      return;
    }

    const tokenHash = tokenService.hashToken(refreshToken);
    await UserRefreshToken.update(
      { revokedAt: new Date() },
      {
        where: {
          tokenHash,
          revokedAt: null,
        },
      }
    );
  }

  async function logoutAll({ userId }) {
    await UserRefreshToken.update(
      { revokedAt: new Date() },
      {
        where: {
          userId,
          revokedAt: null,
        },
      }
    );
  }

  async function getCurrentUser({ userId }) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }
    if (user.status !== 'active') {
      throw new AppError(
        403,
        'ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact support.'
      );
    }
    return sanitizeUser(user);
  }

  return {
    requestOtp,
    verifyOtp,
    refreshSession,
    logout,
    logoutAll,
    getCurrentUser,
  };
}

const authService = createAuthService();
export default authService;
