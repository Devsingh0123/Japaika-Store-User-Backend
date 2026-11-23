import * as authService from '../services/auth.service.js';
import { REFRESH_COOKIE_NAME, setAuthCookies, clearAuthCookies } from '../services/token.service.js';
import { sendSuccess } from '../utils/http.js';

export async function requestOtp(req, res) {
  const result = await authService.requestOtp({
    email: req.body.email,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return sendSuccess(res, {
    message: 'If the email address is valid, a 6-digit verification code has been sent.',
    data: result,
  });
}

export async function verifyOtp(req, res) {
  const { user, isNewUser, accessToken, refreshToken } = await authService.verifyOtp({
    email: req.body.email,
    otp: req.body.otp,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  setAuthCookies(res, { accessToken, refreshToken });

  return sendSuccess(res, {
    message: 'Authentication successful.',
    data: { isNewUser, user },
  });
}

export async function refresh(req, res) {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

  try {
    const { user, accessToken, refreshToken } = await authService.refreshSession({
      refreshToken: rawRefreshToken,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    setAuthCookies(res, { accessToken, refreshToken });

    return sendSuccess(res, {
      message: 'Session refreshed.',
      data: { user },
    });
  } catch (err) {
    if (err?.statusCode === 401 || err?.statusCode === 403) {
      clearAuthCookies(res);
    }
    throw err;
  }
}

export async function logout(req, res) {
  try {
    await authService.logout({ refreshToken: req.cookies?.[REFRESH_COOKIE_NAME] });
  } finally {
    clearAuthCookies(res);
  }

  return sendSuccess(res, { message: 'Logged out successfully.', data: null });
}

export async function logoutAll(req, res) {
  await authService.logoutAll({ userId: req.user.id });
  clearAuthCookies(res);

  return sendSuccess(res, { message: 'Logged out from all devices.', data: null });
}

export async function getMe(req, res) {
  const user = await authService.getCurrentUser({ userId: req.user.id });

  return sendSuccess(res, {
    message: 'Authenticated customer retrieved.',
    data: { user },
  });
}
