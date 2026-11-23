import { Router } from 'express';
import { z } from 'zod';
import { validateQuery, validateParams } from '../middlewares/validate.middleware.js';
import * as catalogController from '../controllers/catalog.controller.js';

const optionalBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((val) => (val === undefined ? undefined : val === 'true'));

const listCategoriesQuerySchema = z.object({
  includeEmpty: optionalBool.default(true),
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
router.get('/:slug', validateParams(categorySlugParamsSchema), catalogController.getCategoryBySlug);

export default router;
