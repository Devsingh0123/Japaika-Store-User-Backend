import * as bannerService from '../services/banner.service.js';
import { sendSuccess } from '../utils/http.js';

export async function listBanners(req, res) {
  const data = await bannerService.listActiveBanners(req.validatedQuery);
  return sendSuccess(res, {
    message: 'Banners retrieved successfully.',
    data,
  });
}
