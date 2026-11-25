import { Router } from 'express';
import { z } from 'zod';
import {
  validateQuery,
  validateParams,
  optionalBool,
  countryQueryField,
} from '../middlewares/validate.middleware.js';
import * as catalogController from '../controllers/catalog.controller.js';

const optionalNonNegativeNumber = z
  .string()
  .trim()
  .optional()
  .transform((val) => (val === undefined || val === '' ? undefined : Number(val)))
  .refine((val) => val === undefined || (Number.isFinite(val) && val >= 0), {
    message: 'Must be a valid non-negative number.',
  });

const listProductsQuerySchema = z
  .object({
    country: countryQueryField,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(12),
    search: z.string().trim().max(120).optional(),
    q: z.string().trim().max(120).optional(),
    category: z
      .string()
      .trim()
      .max(150)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Invalid category slug format.')
      .optional(),
    categoryId: z.string().uuid('Invalid categoryId UUID.').optional(),
    productType: z.enum(['simple', 'variant']).optional(),
    featured: optionalBool,
    inStock: optionalBool,
    onSale: optionalBool,
    minPrice: optionalNonNegativeNumber,
    maxPrice: optionalNonNegativeNumber,
    sort: z.enum(['newest', 'featured', 'price_asc', 'price_desc', 'name_asc']).default('newest'),
  })
  .refine(
    (data) =>
      data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
    {
      path: ['minPrice'],
      message: 'minPrice must be less than or equal to maxPrice.',
    }
  );

const getProductQuerySchema = z.object({
  country: countryQueryField,
});

const productSlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Product slug is required.')
    .max(220, 'Product slug is too long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Invalid product slug format.'),
});

const router = Router();

router.get('/', validateQuery(listProductsQuerySchema), catalogController.listProducts);
router.get(
  '/:slug',
  validateParams(productSlugParamsSchema),
  validateQuery(getProductQuerySchema),
  catalogController.getProductBySlug
);

export default router;
