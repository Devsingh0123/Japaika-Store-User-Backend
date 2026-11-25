import { Router } from 'express';
import { z } from 'zod';
import {
  validateQuery,
  validateParams,
  optionalBool,
  countryQueryField,
} from '../middlewares/validate.middleware.js';
import * as catalogController from '../controllers/catalog.controller.js';

const listCategoriesQuerySchema = z.object({
  country: countryQueryField,
  includeEmpty: optionalBool.default(true),
});

const getCategoryQuerySchema = z.object({
  country: countryQueryField,
});

const categorySlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Category slug is required.')
    .max(150, 'Category slug is too long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Invalid category slug format.'),
});

const router = Router();

router.get('/', validateQuery(listCategoriesQuerySchema), catalogController.listCategories);
router.get(
  '/:slug',
  validateParams(categorySlugParamsSchema),
  validateQuery(getCategoryQuerySchema),
  catalogController.getCategoryBySlug
);

export default router;
