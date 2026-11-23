import { AppError } from '../utils/http.js';

export function validateBody(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request data.', details));
    }

    req.body = parsed.data;
    return next();
  };
}
