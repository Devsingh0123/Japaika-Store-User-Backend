import { Router } from 'express';
import { z } from 'zod';
import {
  validateBody,
  validateQuery,
  countryQueryField,
  cartItemSchema,
  couponCodeField,
} from '../middlewares/validate.middleware.js';
import * as couponController from '../controllers/coupon.controller.js';

const listCouponsQuerySchema = z.object({
  country: countryQueryField,
});

const validateCouponBodySchema = z.object({
  country: countryQueryField,
  couponCode: couponCodeField,
  items: z
    .array(cartItemSchema, { error: 'items array is required.' })
    .min(1, 'Cart must contain at least one item.')
    .max(50, 'Cart cannot contain more than 50 distinct items.'),
});

const router = Router();

router.get('/', validateQuery(listCouponsQuerySchema), couponController.listCoupons);
router.post('/validate', validateBody(validateCouponBodySchema), couponController.validateCoupon);

export default router;
