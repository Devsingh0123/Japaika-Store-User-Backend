import * as couponService from '../services/coupon.service.js';
import { sendSuccess } from '../utils/http.js';

export async function listCoupons(req, res) {
  const data = await couponService.listPublicCoupons(req.validatedQuery);
  return sendSuccess(res, {
    message: 'Available coupons retrieved successfully.',
    data,
  });
}

export async function validateCoupon(req, res) {
  const data = await couponService.validateCartAndCoupon(req.body);
  return sendSuccess(res, {
    message: data.coupon
      ? 'Cart and coupon validated successfully.'
      : 'Cart validated successfully.',
    data,
  });
}
