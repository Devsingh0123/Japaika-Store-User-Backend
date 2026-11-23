import { AppError, sendError } from '../utils/http.js';

export function notFoundHandler(req, res) {
  return sendError(res, {
    statusCode: 404,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return sendError(res, {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details || [],
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendError(res, {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Malformed JSON request body.',
    });
  }

  if (err?.name === 'SequelizeValidationError' || err?.name === 'SequelizeUniqueConstraintError') {
    const details = (err.errors || []).map((item) => ({
      field: item.path || 'unknown',
      message: item.message,
    }));
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Database validation error.',
      details,
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error('[ERROR]', err);
  }

  return sendError(res, {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
  });
}
