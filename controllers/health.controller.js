import { sequelize as defaultSequelize } from '../models/index.js';
import { sendSuccess, sendError } from '../utils/response.js';

export function createHealthController({ sequelize = defaultSequelize } = {}) {
  return async function getHealth(_req, res) {
    try {
      await sequelize.authenticate();
      return sendSuccess(res, {
        statusCode: 200,
        message: 'User backend is healthy',
        data: {
          service: 'user-backend',
          status: 'ok',
          database: 'connected',
        },
      });
    } catch {
      return sendError(res, {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database connection is unavailable.',
      });
    }
  };
}

export default createHealthController;
