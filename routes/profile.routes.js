import { Router } from 'express';
import { z } from 'zod';
import requireCustomerAuth from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { isValidPhone } from '../services/profile.service.js';
import * as profileController from '../controllers/profile.controller.js';

const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters.')
      .max(120, 'Full name cannot exceed 120 characters.')
      .nullable()
      .optional(),
    phone: z
      .string()
      .trim()
      .refine((val) => isValidPhone(val), {
        message: 'Please provide a valid 10 to 15 digit phone number.',
      })
      .nullable()
      .optional(),
  })
  .refine((data) => data.fullName !== undefined || data.phone !== undefined, {
    message: 'At least one profile field (fullName or phone) is required.',
  });

const router = Router();

router.use(requireCustomerAuth);

router.get('/', profileController.getProfile);
router.patch('/', validateBody(updateProfileSchema), profileController.updateProfile);

export default router;
