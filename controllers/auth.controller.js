import env from '../config/env.js';
import defaultAuthService from '../services/auth.service.js';
import defaultTokenService from '../services/token.service.js';
import { sendSuccess } from '../utils/response.js';

export function createAuthController({
  authService = defaultAuthService,
  tokenService = defaultTokenService,
} = {}) {
  async function requestOtp(req, res) {
    const result = await authService.requestOtp({
      email: req.body.email,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'If the email address is valid, a 6-digit verification code has been sent.',
      data: result,
    });
  }

  async function verifyOtp(req, res) {
    const { user, isNewUser, accessToken, refreshToken } = await authService.verifyOtp({
      email: req.body.email,
      otp: req.body.otp,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    tokenService.setAuthCookies(res, { accessToken, refreshToken });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Authentication successful.',
      data: {
        isNewUser,
        user,
      },
    });
  }

  async function refresh(req, res) {
    const rawRefreshToken = req.cookies?.[env.cookie.refreshName];

    try {
      const { user, accessToken, refreshToken } = await authService.refreshSession({
        refreshToken: rawRefreshToken,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      tokenService.setAuthCookies(res, { accessToken, refreshToken });

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Session refreshed.',
        data: { user },
      });
    } catch (err) {
      if (err?.statusCode === 401 || err?.statusCode === 403) {
        tokenService.clearAuthCookies(res);
      }
      throw err;
    }
  }

  async function logout(req, res) {
    const rawRefreshToken = req.cookies?.[env.cookie.refreshName];

    try {
      await authService.logout({ refreshToken: rawRefreshToken });
    } finally {
      tokenService.clearAuthCookies(res);
    }

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Logged out successfully.',
      data: null,
    });
  }

  async function logoutAll(req, res) {
    await authService.logoutAll({ userId: req.user.id });
    tokenService.clearAuthCookies(res);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Logged out from all devices.',
      data: null,
    });
  }

  async function getMe(req, res) {
    const user = await authService.getCurrentUser({ userId: req.user.id });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Authenticated customer retrieved.',
      data: { user },
    });
  }

  return {
    requestOtp,
    verifyOtp,
    refresh,
    logout,
    logoutAll,
    getMe,
  };
}

export default createAuthController;
