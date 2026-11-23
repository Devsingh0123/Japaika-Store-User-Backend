import * as catalogService from '../services/catalog.service.js';
import { sendSuccess } from '../utils/http.js';

export async function listCategories(req, res) {
  const data = await catalogService.listCategories(req.validatedQuery);
  return sendSuccess(res, {
    message: 'Categories retrieved successfully.',
    data,
  });
}

export async function getCategoryBySlug(req, res) {
  const category = await catalogService.getCategoryBySlug(req.validatedParams.slug);
  return sendSuccess(res, {
    message: 'Category retrieved successfully.',
    data: { category },
  });
}

export async function listProducts(req, res) {
  const q = req.validatedQuery;
  const data = await catalogService.listProducts({
    page: q.page,
    limit: q.limit,
    search: q.search || q.q || undefined,
    category: q.category,
    categoryId: q.categoryId,
    productType: q.productType,
    featured: q.featured,
    inStock: q.inStock,
    onSale: q.onSale,
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    sort: q.sort,
  });

  return sendSuccess(res, {
    message: 'Products retrieved successfully.',
    data,
  });
}

export async function getProductBySlug(req, res) {
  const product = await catalogService.getProductBySlug(req.validatedParams.slug);
  return sendSuccess(res, {
    message: 'Product retrieved successfully.',
    data: { product },
  });
}
