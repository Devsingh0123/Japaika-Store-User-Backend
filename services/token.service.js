import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import AppError from '../utils/appError.js';

const DURATION_UNITS_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationToMs(duration, fallbackMs) {
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    return duration * 1000;
  }
  const match = String(duration || '')
    .trim()
    .match(/^(\d+)([smhd])$/i);
  if (!match) {
    return fallbackMs;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return value * DURATION_UNITS_MS[unit];
}

export function getAccessMaxAgeMs() {
  return parseDurationToMs(env.jwt.accessExpiresIn, 15 * 60 * 1000);
}

export function getRefreshMaxAgeMs() {
  return parseDurationToMs(env.jwt.refreshExpiresIn, 30 * 24 * 60 * 60 * 1000);
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      subType: 'customer',
      tokenType: 'access',
    },
    env.jwt.accessSecret,
    {
      algorithm: 'HS256',
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      expiresIn: env.jwt.accessExpiresIn,
    }
  );
}

export function signRefreshToken({ userId, tokenId, familyId }) {
  return jwt.sign(
    {
      sub: userId,
      jti: tokenId,
      familyId,
      subType: 'customer',
      tokenType: 'refresh',
    },
    env.jwt.refreshSecret,
    {
      algorithm: 'HS256',
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      expiresIn: env.jwt.refreshExpiresIn,
    }
  );
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, env.jwt.accessSecret, {
      algorithms: ['HS256'],
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });

    if (
      !payload ||
      typeof payload !== 'object' ||
      payload.subType !== 'customer' ||
      payload.tokenType !== 'access' ||
      !payload.sub
    ) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid authentication token.');
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is invalid or expired.');
  }
}

export function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, env.jwt.refreshSecret, {
      algorithms: ['HS256'],
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });

    if (
      !payload ||
      typeof payload !== 'object' ||
      payload.subType !== 'customer' ||
      payload.tokenType !== 'refresh' ||
      !payload.sub ||
      !payload.jti ||
      !payload.familyId
    ) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token.');
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired.');
  }
}

function getBaseCookieOptions() {
  const options = {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
  };

  if (env.cookie.domain) {
    options.domain = env.cookie.domain;
  }

  return options;
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  const baseOptions = getBaseCookieOptions();

  res.cookie(env.cookie.accessName, accessToken, {
    ...baseOptions,
    path: '/',
    maxAge: getAccessMaxAgeMs(),
  });

  res.cookie(env.cookie.refreshName, refreshToken, {
    ...baseOptions,
    path: '/api/v1/auth',
    maxAge: getRefreshMaxAgeMs(),
  });
}

export function clearAuthCookies(res) {
  const baseOptions = getBaseCookieOptions();

  res.clearCookie(env.cookie.accessName, {
    ...baseOptions,
    path: '/',
  });

  res.clearCookie(env.cookie.refreshName, {
    ...baseOptions,
    path: '/api/v1/auth',
  });
}

export default {
  parseDurationToMs,
  getAccessMaxAgeMs,
  getRefreshMaxAgeMs,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
};
