import { Router } from 'express';
import { z } from 'zod';
import { BANNER_PLACEMENTS } from '../models/index.js';
import { validateQuery } from '../middlewares/validate.middleware.js';
import * as bannerController from '../controllers/banner.controller.js';

const listBannersQuerySchema = z.object({
  placement: z.enum(BANNER_PLACEMENTS).optional(),
  limit: z.coerce
    .number()
    .int('Limit must be a whole number.')
    .min(1, 'Limit must be at least 1.')
    .max(20, 'Limit cannot exceed 20.')
    .default(10),
});

const router = Router();

router.get('/', validateQuery(listBannersQuerySchema), bannerController.listBanners);

export default router;
