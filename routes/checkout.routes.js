import { Router } from 'express';
import { z } from 'zod';
import requireCustomerAuth from '../middlewares/auth.middleware.js';
import {
  validateBody,
  validateQuery,
  countryQueryField,
  cartItemSchema,
  couponCodeField,
} from '../middlewares/validate.middleware.js';
import * as checkoutController from '../controllers/checkout.controller.js';

const shippingQuerySchema = z.object({
  country: countryQueryField,
});

const createOrderBodySchema = z.object({
  country: countryQueryField,
  addressId: z
    .string({ error: 'addressId is required.' })
    .uuid('Invalid shipping addressId UUID format.'),
  couponCode: couponCodeField,
  customerNotes: z
    .string()
    .trim()
    .max(500, 'Customer notes cannot exceed 500 characters.')
    .nullable()
    .optional(),
  items: z
    .array(cartItemSchema, { error: 'items array is required.' })
    .min(1, 'Order must contain at least one item.')
    .max(50, 'Order cannot contain more than 50 distinct items.'),
});

const verifyPaymentBodySchema = z.object({
  orderNumber: z
    .string({ error: 'orderNumber is required.' })
    .trim()
    .min(5, 'orderNumber is required.')
    .max(32, 'orderNumber is too long.'),
  razorpayOrderId: z
    .string({ error: 'razorpayOrderId is required.' })
    .trim()
    .min(5, 'razorpayOrderId is required.')
    .max(64, 'razorpayOrderId is too long.'),
  razorpayPaymentId: z
    .string({ error: 'razorpayPaymentId is required.' })
    .trim()
    .min(5, 'razorpayPaymentId is required.')
    .max(64, 'razorpayPaymentId is too long.'),
  razorpaySignature: z
    .string({ error: 'razorpaySignature is required.' })
    .trim()
    .regex(/^[0-9a-f]{64}$/i, 'Invalid razorpaySignature format.'),
});

const router = Router();

router.get('/shipping', validateQuery(shippingQuerySchema), checkoutController.getShippingConfig);
router.post(
  '/create-order',
  requireCustomerAuth,
  validateBody(createOrderBodySchema),
  checkoutController.createCheckoutOrder
);
router.post(
  '/verify-payment',
  requireCustomerAuth,
  validateBody(verifyPaymentBodySchema),
  checkoutController.verifyCheckoutPayment
);

export default router;
