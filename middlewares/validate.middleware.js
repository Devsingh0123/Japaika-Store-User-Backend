import { z } from 'zod';
import { SUPPORTED_COUNTRIES, DEFAULT_COUNTRY } from '../models/index.js';
import { AppError } from '../utils/http.js';

export const optionalBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((val) => (val === undefined ? undefined : val === 'true'));

export const countryCodeField = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() !== '' ? val.trim().toUpperCase() : val),
  z.enum(SUPPORTED_COUNTRIES)
);

export const countryQueryField = countryCodeField.default(DEFAULT_COUNTRY);

export const cartItemSchema = z.object({
  variantId: z.string({ error: 'variantId is required.' }).uuid('Invalid variantId UUID format.'),
  quantity: z
    .number({ error: 'quantity must be a number.' })
    .int('quantity must be a whole number.')
    .min(1, 'quantity must be at least 1.')
    .max(99, 'quantity cannot exceed 99 per item.'),
});

export const couponCodeField = z
  .string()
  .trim()
  .min(3, 'Coupon code must be at least 3 characters.')
  .max(32, 'Coupon code cannot exceed 32 characters.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/, 'Invalid coupon code format.')
  .nullable()
  .optional();

function formatIssues(issues, fallbackField) {
  return issues.map((issue) => ({
    field: issue.path.join('.') || fallbackField,
    message: issue.message,
  }));
}

export function validateBody(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Invalid request data.', formatIssues(parsed.error.issues, 'body'))
      );
    }

    req.body = parsed.data;
    return next();
  };
}

export function validateQuery(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Invalid query parameters.', formatIssues(parsed.error.issues, 'query'))
      );
    }

    req.validatedQuery = parsed.data;
    return next();
  };
}

export function validateParams(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Invalid route parameters.', formatIssues(parsed.error.issues, 'params'))
      );
    }

    req.validatedParams = parsed.data;
    return next();
  };
}
