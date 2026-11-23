import { User } from '../models/index.js';
import { ACCESS_COOKIE_NAME, verifyAccessToken } from '../services/token.service.js';
import { AppError } from '../utils/http.js';

export default async function requireCustomerAuth(req, _res, next) {
  const accessToken = req.cookies?.[ACCESS_COOKIE_NAME];
  if (!accessToken) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  const payload = verifyAccessToken(accessToken);
  const user = await User.findByPk(payload.sub);

  if (!user) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  if (user.status !== 'active') {
    return next(new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact support.'));
  }

  req.user = { id: user.id, email: user.email, status: user.status };
  return next();
}
