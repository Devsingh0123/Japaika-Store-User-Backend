import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/http.js';

export const ACCESS_COOKIE_NAME = 'japaika_user_access';
export const REFRESH_COOKIE_NAME = 'japaika_user_refresh';
export const JWT_ISSUER = 'japaika-user-backend';
export const JWT_AUDIENCE = 'japaika-user';
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '30d';

const DEV_ACCESS_SECRET = 'dev_only_user_jwt_access_secret_replace_in_prod_32';
const DEV_REFRESH_SECRET = 'dev_only_user_jwt_refresh_secret_replace_in_prod_32';
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function getJwtSecrets(raw = process.env) {
  const isProd = raw.NODE_ENV === 'production';
  const accessSecret = raw.USER_JWT_ACCESS_SECRET || (isProd ? '' : DEV_ACCESS_SECRET);
  const refreshSecret = raw.USER_JWT_REFRESH_SECRET || (isProd ? '' : DEV_REFRESH_SECRET);

  if (accessSecret.length < 32 || refreshSecret.length < 32) {
    throw new Error('USER_JWT_ACCESS_SECRET and USER_JWT_REFRESH_SECRET must be at least 32 characters.');
  }

  if (accessSecret === refreshSecret) {
    throw new Error('USER_JWT_REFRESH_SECRET must differ from USER_JWT_ACCESS_SECRET.');
  }

  if (
    isProd &&
    (accessSecret === DEV_ACCESS_SECRET ||
      refreshSecret === DEV_REFRESH_SECRET ||
      accessSecret === 'change_me_access_secret_min_32_chars_long' ||
      refreshSecret === 'change_me_refresh_secret_min_32_chars_long')
  ) {
    throw new Error('Production requires custom USER_JWT_ACCESS_SECRET and USER_JWT_REFRESH_SECRET.');
  }

  return { accessSecret, refreshSecret };
}

export function parseDurationToMs(duration, fallbackMs) {
  const match = String(duration || '').trim().match(/^(\d+)([smhd])$/i);
  return match ? Number(match[1]) * UNIT_MS[match[2].toLowerCase()] : fallbackMs;
}

export function getRefreshMaxAgeMs() {
  return parseDurationToMs(REFRESH_TOKEN_TTL, 30 * UNIT_MS.d);
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

export function signAccessToken(user) {
  const { accessSecret } = getJwtSecrets();
  return jwt.sign(
    { sub: user.id, email: user.email, subType: 'customer', tokenType: 'access' },
    accessSecret,
    {
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL,
    }
  );
}

export function signRefreshToken({ userId, tokenId, familyId }) {
  const { refreshSecret } = getJwtSecrets();
  return jwt.sign(
    { sub: userId, jti: tokenId, familyId, subType: 'customer', tokenType: 'refresh' },
    refreshSecret,
    {
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: REFRESH_TOKEN_TTL,
    }
  );
}

function verifyJwt(token, { secret, tokenType, errorCode, errorMessage }) {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (
      typeof payload !== 'object' ||
      payload.subType !== 'customer' ||
      payload.tokenType !== tokenType ||
      !payload.sub
    ) {
      throw new AppError(401, errorCode, errorMessage);
    }

    if (tokenType === 'refresh' && (!payload.jti || !payload.familyId)) {
      throw new AppError(401, errorCode, errorMessage);
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, errorCode, errorMessage);
  }
}

export function verifyAccessToken(token) {
  const { accessSecret } = getJwtSecrets();
  return verifyJwt(token, {
    secret: accessSecret,
    tokenType: 'access',
    errorCode: 'UNAUTHORIZED',
    errorMessage: 'Authentication token is invalid or expired.',
  });
}

export function verifyRefreshToken(token) {
  const { refreshSecret } = getJwtSecrets();
  return verifyJwt(token, {
    secret: refreshSecret,
    tokenType: 'refresh',
    errorCode: 'INVALID_REFRESH_TOKEN',
    errorMessage: 'Refresh token is invalid or expired.',
  });
}

function cookieBaseOptions() {
  const domain = (process.env.COOKIE_DOMAIN || '').trim();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  const base = cookieBaseOptions();
  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    ...base,
    path: '/',
    maxAge: parseDurationToMs(ACCESS_TOKEN_TTL, 15 * UNIT_MS.m),
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...base,
    path: '/api/v1/auth',
    maxAge: getRefreshMaxAgeMs(),
  });
}

export function clearAuthCookies(res) {
  const base = cookieBaseOptions();
  res.clearCookie(ACCESS_COOKIE_NAME, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE_NAME, { ...base, path: '/api/v1/auth' });
}
