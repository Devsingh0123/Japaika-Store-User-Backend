import { Router } from 'express';
import { z } from 'zod';
import { ALL_ORDER_STATUSES } from '../models/index.js';
import requireCustomerAuth from '../middlewares/auth.middleware.js';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../middlewares/validate.middleware.js';
import * as checkoutController from '../controllers/checkout.controller.js';

const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(ALL_ORDER_STATUSES).optional(),
});

const orderNumberParamsSchema = z.object({
  orderNumber: z
    .string({ error: 'orderNumber is required.' })
    .trim()
    .min(5, 'Invalid order number.')
    .max(32, 'Invalid order number.')
    .regex(/^[A-Za-z0-9-]+$/, 'Invalid order number format.'),
});

const cancelOrderBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(2, 'Cancellation reason must be at least 2 characters.')
    .max(255, 'Cancellation reason cannot exceed 255 characters.')
    .nullable()
    .optional(),
});

const router = Router();

router.use(requireCustomerAuth);

router.get('/', validateQuery(listOrdersQuerySchema), checkoutController.listOrders);
router.get(
  '/:orderNumber',
  validateParams(orderNumberParamsSchema),
  checkoutController.getOrderByNumber
);
router.post(
  '/:orderNumber/retry-payment',
  validateParams(orderNumberParamsSchema),
  checkoutController.retryOrderPayment
);
router.post(
  '/:orderNumber/cancel',
  validateParams(orderNumberParamsSchema),
  validateBody(cancelOrderBodySchema),
  checkoutController.cancelOrder
);

export default router;
