import env from '../config/env.js';
import { User as DefaultUser } from '../models/index.js';
import defaultTokenService from '../services/token.service.js';
import AppError from '../utils/appError.js';

export function createAuthMiddleware({
  User = DefaultUser,
  tokenService = defaultTokenService,
} = {}) {
  return async function requireCustomerAuth(req, _res, next) {
    const accessToken = req.cookies?.[env.cookie.accessName];

    if (!accessToken) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
    }

    const payload = tokenService.verifyAccessToken(accessToken);

    const user = await User.findByPk(payload.sub);
    if (!user) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
    }

    if (user.status !== 'active') {
      return next(
        new AppError(
          403,
          'ACCOUNT_SUSPENDED',
          'Your account has been suspended. Please contact support.'
        )
      );
    }

    req.user = {
      id: user.id,
      email: user.email,
      status: user.status,
    };

    return next();
  };
}

const requireCustomerAuth = createAuthMiddleware();
export default requireCustomerAuth;
