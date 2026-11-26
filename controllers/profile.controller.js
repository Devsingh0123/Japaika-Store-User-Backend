import * as profileService from '../services/profile.service.js';
import { sendSuccess } from '../utils/http.js';

export async function getProfile(req, res) {
  const data = await profileService.getProfile(req.user.id);
  return sendSuccess(res, {
    message: 'Customer profile retrieved successfully.',
    data,
  });
}

export async function updateProfile(req, res) {
  const data = await profileService.updateProfile(req.user.id, req.body);
  return sendSuccess(res, {
    message: 'Customer profile updated successfully.',
    data,
  });
}

export async function lookupPostalCode(req, res) {
  const data = await profileService.lookupPostalCode(req.validatedQuery);
  return sendSuccess(res, {
    message: data.found
      ? 'Postal code details found.'
      : 'Postal code not found in directory. Please enter city, district, and state manually.',
    data,
  });
}

export async function listAddresses(req, res) {
  const data = await profileService.listAddresses(req.user.id, req.validatedQuery);
  return sendSuccess(res, {
    message: 'Addresses retrieved successfully.',
    data,
  });
}

export async function getAddressById(req, res) {
  const address = await profileService.getAddressById(req.user.id, req.validatedParams.id);
  return sendSuccess(res, {
    message: 'Address retrieved successfully.',
    data: { address },
  });
}

export async function createAddress(req, res) {
  const address = await profileService.createAddress(req.user.id, req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Address created successfully.',
    data: { address },
  });
}

export async function updateAddress(req, res) {
  const address = await profileService.updateAddress(req.user.id, req.validatedParams.id, req.body);
  return sendSuccess(res, {
    message: 'Address updated successfully.',
    data: { address },
  });
}

export async function setDefaultAddress(req, res) {
  const address = await profileService.setDefaultAddress(req.user.id, req.validatedParams.id);
  return sendSuccess(res, {
    message: 'Default address updated successfully.',
    data: { address },
  });
}

export async function deleteAddress(req, res) {
  const data = await profileService.deleteAddress(req.user.id, req.validatedParams.id);
  return sendSuccess(res, {
    message: 'Address deleted successfully.',
    data,
  });
}
