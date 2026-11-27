import { Router } from 'express';
import { z } from 'zod';
import { ADDRESS_LABELS } from '../models/index.js';
import requireCustomerAuth from '../middlewares/auth.middleware.js';
import {
  validateBody,
  validateQuery,
  validateParams,
  countryCodeField,
  countryQueryField,
} from '../middlewares/validate.middleware.js';
import { isValidPhone } from '../services/profile.service.js';
import * as profileController from '../controllers/profile.controller.js';

const postalLookupQuerySchema = z.object({
  country: countryQueryField,
  postalCode: z
    .string({ error: 'postalCode is required.' })
    .trim()
    .min(1, 'postalCode is required.')
    .max(20, 'postalCode cannot exceed 20 characters.'),
});

const listAddressesQuerySchema = z.object({
  country: countryCodeField.optional(),
});

const addressIdParamsSchema = z.object({
  id: z.string().uuid('Invalid address ID format.'),
});

const phoneField = z
  .string({ error: 'Phone number is required.' })
  .trim()
  .refine((val) => isValidPhone(val), {
    message: 'Please provide a valid 10 to 15 digit phone number.',
  });

const createAddressSchema = z.object({
  label: z.enum(ADDRESS_LABELS).default('home'),
  fullName: z
    .string({ error: 'Recipient full name is required.' })
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(120, 'Full name cannot exceed 120 characters.'),
  phone: phoneField,
  addressLine1: z
    .string({ error: 'Address line 1 is required.' })
    .trim()
    .min(3, 'Address line 1 must be at least 3 characters.')
    .max(200, 'Address line 1 cannot exceed 200 characters.'),
  addressLine2: z
    .string()
    .trim()
    .max(200, 'Address line 2 cannot exceed 200 characters.')
    .nullable()
    .optional(),
  landmark: z
    .string()
    .trim()
    .max(160, 'Landmark cannot exceed 160 characters.')
    .nullable()
    .optional(),
  city: z
    .string()
    .trim()
    .min(1, 'City cannot be empty.')
    .max(100, 'City cannot exceed 100 characters.')
    .optional(),
  district: z
    .string()
    .trim()
    .max(100, 'District cannot exceed 100 characters.')
    .nullable()
    .optional(),
  state: z
    .string()
    .trim()
    .min(1, 'State cannot be empty.')
    .max(100, 'State cannot exceed 100 characters.')
    .optional(),
  postalCode: z
    .string({ error: 'Postal code is required.' })
    .trim()
    .min(1, 'Postal code is required.')
    .max(20, 'Postal code cannot exceed 20 characters.'),
  country: countryQueryField,
  isDefault: z.boolean().optional(),
});

const updateAddressSchema = z
  .object({
    label: z.enum(ADDRESS_LABELS).optional(),
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters.')
      .max(120, 'Full name cannot exceed 120 characters.')
      .optional(),
    phone: phoneField.optional(),
    addressLine1: z
      .string()
      .trim()
      .min(3, 'Address line 1 must be at least 3 characters.')
      .max(200, 'Address line 1 cannot exceed 200 characters.')
      .optional(),
    addressLine2: z
      .string()
      .trim()
      .max(200, 'Address line 2 cannot exceed 200 characters.')
      .nullable()
      .optional(),
    landmark: z
      .string()
      .trim()
      .max(160, 'Landmark cannot exceed 160 characters.')
      .nullable()
      .optional(),
    city: z
      .string()
      .trim()
      .min(1, 'City cannot be empty.')
      .max(100, 'City cannot exceed 100 characters.')
      .optional(),
    district: z
      .string()
      .trim()
      .max(100, 'District cannot exceed 100 characters.')
      .nullable()
      .optional(),
    state: z
      .string()
      .trim()
      .min(1, 'State cannot be empty.')
      .max(100, 'State cannot exceed 100 characters.')
      .optional(),
    postalCode: z
      .string()
      .trim()
      .min(1, 'Postal code is required.')
      .max(20, 'Postal code cannot exceed 20 characters.')
      .optional(),
    country: countryCodeField.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one address field must be provided for update.',
  });

const router = Router();

// Public/storefront self-hosted postal auto-fill lookup
router.get('/lookup', validateQuery(postalLookupQuerySchema), profileController.lookupPostalCode);

// Authenticated customer address book CRUD
router.use(requireCustomerAuth);

router.get('/', validateQuery(listAddressesQuerySchema), profileController.listAddresses);
router.post('/', validateBody(createAddressSchema), profileController.createAddress);
router.get('/:id', validateParams(addressIdParamsSchema), profileController.getAddressById);
router.patch(
  '/:id',
  validateParams(addressIdParamsSchema),
  validateBody(updateAddressSchema),
  profileController.updateAddress
);
router.patch(
  '/:id/default',
  validateParams(addressIdParamsSchema),
  profileController.setDefaultAddress
);
router.delete('/:id', validateParams(addressIdParamsSchema), profileController.deleteAddress);

export default router;
