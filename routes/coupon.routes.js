import { Router } from 'express';
import { z } from 'zod';
import {
  SUPPORTED_COUNTRIES,
  DEFAULT_COUNTRY,
} from '../models/index.js';
import {
  validateBody,
  validateQuery,
  countryQueryField,
} from '../middlewares/validate.middleware.js';
import * as couponController from '../controllers/coupon.controller.js';

const listCouponsQuerySchema = z.object({
  country: countryQueryField,
});

const cartItemSchema = z.object({
  variantId: z.string({ error: 'variantId is required.' }).uuid('Invalid variantId UUID format.'),
  quantity: z
    .number({ error: 'quantity must be a number.' })
    .int('quantity must be a whole number.')
    .min(1, 'quantity must be at least 1.')
    .max(99, 'quantity cannot exceed 99 per item.'),
});

const validateCouponBodySchema = z.object({
  country: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() !== '' ? val.trim().toUpperCase() : val),
    z.enum(SUPPORTED_COUNTRIES).default(DEFAULT_COUNTRY)
  ),
  couponCode: z
    .string()
    .trim()
    .min(3, 'Coupon code must be at least 3 characters.')
    .max(32, 'Coupon code cannot exceed 32 characters.')
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/, 'Invalid coupon code format.')
    .nullable()
    .optional(),
  items: z
    .array(cartItemSchema, { error: 'items array is required.' })
    .min(1, 'Cart must contain at least one item.')
    .max(50, 'Cart cannot contain more than 50 distinct items.'),
});

const router = Router();

router.get('/', validateQuery(listCouponsQuerySchema), couponController.listCoupons);
router.post('/validate', validateBody(validateCouponBodySchema), couponController.validateCoupon);

export default router;
