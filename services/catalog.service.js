import { Op } from 'sequelize';
import {
  sequelize,
  Category,
  Product,
  ProductVariant,
  ProductMedia,
  PRODUCT_STATUSES,
  PRODUCT_MEDIA_TYPES,
} from '../models/index.js';
import { AppError } from '../utils/http.js';

const ACTIVE_VARIANT_EXISTS_SQL =
  'EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = Product.id AND pv.is_active = 1 AND pv.deleted_at IS NULL)';

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function formatSeo(entity) {
  return {
    title: entity.seoTitle || null,
    description: entity.seoDescription || null,
  };
}

function formatCategorySummary(cat, parentMap = null) {
  if (!cat) return null;
  const parent = cat.parentId && parentMap ? parentMap.get(cat.parentId) || null : null;
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    parent: parent ? { id: parent.id, name: parent.name, slug: parent.slug } : null,
  };
}

function formatMediaItem(item) {
  return {
    id: item.id,
    mediaType: item.mediaType,
    mediaUrl: item.mediaUrl,
    thumbnailUrl: item.thumbnailUrl || null,
    mimeType: item.mimeType || null,
    durationSeconds: item.durationSeconds !== null && item.durationSeconds !== undefined ? Number(item.durationSeconds) : null,
    altText: item.altText || null,
    isPrimary: Boolean(item.isPrimary),
    sortOrder: item.sortOrder,
  };
}

function selectPrimaryMedia(mediaItems) {
  if (!mediaItems.length) return null;
  return (
    mediaItems.find((m) => m.isPrimary && m.mediaType === PRODUCT_MEDIA_TYPES.IMAGE) ||
    mediaItems.find((m) => m.mediaType === PRODUCT_MEDIA_TYPES.IMAGE) ||
    mediaItems[0]
  );
}

function formatVariant(variant) {
  const priceNum = Number(variant.price);
  const saleNum = variant.salePrice !== null && variant.salePrice !== undefined ? Number(variant.salePrice) : null;
  const effectiveNum = saleNum !== null ? saleNum : priceNum;
  const discountPercent = saleNum !== null && priceNum > 0 ? Math.round(((priceNum - saleNum) / priceNum) * 100) : 0;
  const stockQuantity = Number(variant.stockQuantity || 0);
  const inStock = stockQuantity > 0;
  const isLowStock = inStock && stockQuantity <= Number(variant.lowStockThreshold ?? 5);

  return {
    id: variant.id,
    sku: variant.sku,
    title: variant.title || null,
    optionValues: parseJsonField(variant.optionValues, null),
    price: formatMoney(priceNum),
    salePrice: saleNum !== null ? formatMoney(saleNum) : null,
    effectivePrice: formatMoney(effectiveNum),
    discountPercent,
    stockQuantity,
    inStock,
    isLowStock,
    isOutOfStock: !inStock,
    isPurchasable: inStock,
    isDefault: Boolean(variant.isDefault),
    sortOrder: variant.sortOrder,
  };
}

function buildPricingAndAvailability(product, formattedVariants) {
  const defaultVariant = formattedVariants.find((v) => v.isDefault) || formattedVariants[0];
  const effectivePrices = formattedVariants.map((v) => Number(v.effectivePrice));
  const minPrice = Math.min(...effectivePrices);
  const maxPrice = Math.max(...effectivePrices);
  const totalStock = formattedVariants.reduce((sum, v) => sum + v.stockQuantity, 0);
  const inStock = totalStock > 0;

  return {
    defaultVariantId: defaultVariant.id,
    pricing: {
      price: defaultVariant.price,
      salePrice: defaultVariant.salePrice,
      effectivePrice: defaultVariant.effectivePrice,
      minPrice: formatMoney(minPrice),
      maxPrice: formatMoney(maxPrice),
      discountPercent: defaultVariant.discountPercent,
      gstInclusive: true,
      gstRate: formatMoney(product.gstRate),
    },
    availability: {
      inStock,
      isOutOfStock: !inStock,
      isPurchasable: inStock,
      totalStock,
      variantCount: formattedVariants.length,
    },
  };
}

function formatCertificate(product) {
  if (!product.certificateUrl) return null;
  return {
    url: product.certificateUrl,
    resourceType: product.certificateResourceType || 'image',
    label: product.certificateLabel || null,
  };
}

function formatShipping(product) {
  const hasShipping =
    product.weightGrams !== null ||
    product.lengthCm !== null ||
    product.widthCm !== null ||
    product.heightCm !== null ||
    Boolean(product.shippingNotes);

  if (!hasShipping) return null;

  return {
    weightGrams: product.weightGrams ?? null,
    lengthCm: product.lengthCm !== null && product.lengthCm !== undefined ? Number(product.lengthCm) : null,
    widthCm: product.widthCm !== null && product.widthCm !== undefined ? Number(product.widthCm) : null,
    heightCm: product.heightCm !== null && product.heightCm !== undefined ? Number(product.heightCm) : null,
    notes: product.shippingNotes || null,
  };
}

/**
 * Loads all customer-visible active categories (root categories and active
 * subcategories whose parent category is also active and non-deleted).
 */
async function loadVisibleCategories() {
  const rows = await Category.findAll({
    where: { isActive: true },
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
  });

  const roots = rows.filter((c) => !c.parentId);
  const rootMap = new Map(roots.map((r) => [r.id, r]));
  const subsByParent = new Map(roots.map((r) => [r.id, []]));
  const visibleById = new Map(roots.map((r) => [r.id, r]));
  const visibleBySlug = new Map(roots.map((r) => [r.slug, r]));

  for (const row of rows) {
    if (row.parentId && rootMap.has(row.parentId)) {
      subsByParent.get(row.parentId).push(row);
      visibleById.set(row.id, row);
      visibleBySlug.set(row.slug, row);
    }
  }

  return {
    roots,
    rootMap,
    subsByParent,
    visibleById,
    visibleBySlug,
    visibleIds: [...visibleById.keys()],
  };
}

async function getActiveProductCountsByCategory(visibleIds) {
  const counts = new Map();
  if (!visibleIds.length) return counts;

  const rows = await Product.findAll({
    attributes: [
      'categoryId',
      [sequelize.fn('COUNT', sequelize.col('Product.id')), 'count'],
    ],
    where: {
      status: PRODUCT_STATUSES.ACTIVE,
      categoryId: { [Op.in]: visibleIds },
      [Op.and]: [sequelize.literal(ACTIVE_VARIANT_EXISTS_SQL)],
    },
    group: ['category_id'],
    raw: true,
  });

  for (const row of rows) {
    counts.set(row.categoryId, Number(row.count || 0));
  }

  return counts;
}

// --- Public Customer Category Services ---

export async function listCategories({ includeEmpty = true } = {}) {
  const { roots, subsByParent, visibleIds } = await loadVisibleCategories();
  const directCounts = await getActiveProductCountsByCategory(visibleIds);

  const items = [];

  for (const root of roots) {
    const rawSubs = subsByParent.get(root.id) || [];
    let subcategories = rawSubs.map((sub) => ({
      id: sub.id,
      parentId: sub.parentId,
      name: sub.name,
      slug: sub.slug,
      description: sub.description || null,
      imageUrl: sub.imageUrl || null,
      sortOrder: sub.sortOrder,
      productCount: directCounts.get(sub.id) || 0,
      seo: formatSeo(sub),
    }));

    const subTotal = subcategories.reduce((sum, s) => sum + s.productCount, 0);
    const totalCount = (directCounts.get(root.id) || 0) + subTotal;

    if (!includeEmpty) {
      subcategories = subcategories.filter((s) => s.productCount > 0);
      if (totalCount === 0) continue;
    }

    items.push({
      id: root.id,
      name: root.name,
      slug: root.slug,
      description: root.description || null,
      imageUrl: root.imageUrl || null,
      sortOrder: root.sortOrder,
      productCount: totalCount,
      seo: formatSeo(root),
      subcategories,
    });
  }

  return { items };
}

export async function getCategoryBySlug(slug) {
  const normalizedSlug = String(slug).trim().toLowerCase();
  const { rootMap, subsByParent, visibleBySlug, visibleIds } = await loadVisibleCategories();
  const category = visibleBySlug.get(normalizedSlug);

  if (!category) {
    throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
  }

  const directCounts = await getActiveProductCountsByCategory(visibleIds);

  if (!category.parentId) {
    const rawSubs = subsByParent.get(category.id) || [];
    const subcategories = rawSubs.map((sub) => ({
      id: sub.id,
      parentId: sub.parentId,
      name: sub.name,
      slug: sub.slug,
      description: sub.description || null,
      imageUrl: sub.imageUrl || null,
      sortOrder: sub.sortOrder,
      productCount: directCounts.get(sub.id) || 0,
      seo: formatSeo(sub),
    }));

    const productCount =
      (directCounts.get(category.id) || 0) + subcategories.reduce((sum, s) => sum + s.productCount, 0);

    return {
      id: category.id,
      parentId: null,
      name: category.name,
      slug: category.slug,
      description: category.description || null,
      imageUrl: category.imageUrl || null,
      sortOrder: category.sortOrder,
      productCount,
      seo: formatSeo(category),
      parent: null,
      subcategories,
    };
  }

  const parent = rootMap.get(category.parentId);
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    slug: category.slug,
    description: category.description || null,
    imageUrl: category.imageUrl || null,
    sortOrder: category.sortOrder,
    productCount: directCounts.get(category.id) || 0,
    seo: formatSeo(category),
    parent: parent ? { id: parent.id, name: parent.name, slug: parent.slug } : null,
    subcategories: [],
  };
}

// --- Public Customer Product Services ---

export async function listProducts({
  page = 1,
  limit = 12,
  search,
  category,
  categoryId,
  productType,
  featured,
  inStock,
  onSale,
  minPrice,
  maxPrice,
  sort = 'newest',
} = {}) {
  const { rootMap, subsByParent, visibleById, visibleBySlug, visibleIds } = await loadVisibleCategories();

  const emptyResult = {
    items: [],
    pagination: { page, limit, totalItems: 0, totalPages: 0 },
  };

  if (!visibleIds.length) {
    return emptyResult;
  }

  let targetCategoryIds = visibleIds;

  if (category || categoryId) {
    const resolved = category
      ? visibleBySlug.get(String(category).trim().toLowerCase())
      : visibleById.get(categoryId);

    if (!resolved) {
      return emptyResult;
    }

    if (category && categoryId && resolved.id !== categoryId) {
      return emptyResult;
    }

    if (!resolved.parentId) {
      const childIds = (subsByParent.get(resolved.id) || []).map((s) => s.id);
      targetCategoryIds = [resolved.id, ...childIds];
    } else {
      targetCategoryIds = [resolved.id];
    }
  }

  const andConditions = [sequelize.literal(ACTIVE_VARIANT_EXISTS_SQL)];

  const where = {
    status: PRODUCT_STATUSES.ACTIVE,
    categoryId: { [Op.in]: targetCategoryIds },
  };

  if (productType) {
    where.productType = productType;
  }

  if (typeof featured === 'boolean') {
    where.isFeatured = featured;
  }

  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    const escapedPattern = sequelize.escape(pattern);
    andConditions.push({
      [Op.or]: [
        { name: { [Op.like]: pattern } },
        { shortDescription: { [Op.like]: pattern } },
        { description: { [Op.like]: pattern } },
        { slug: { [Op.like]: pattern } },
        sequelize.literal(
          `EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = Product.id AND pv.is_active = 1 AND pv.deleted_at IS NULL AND pv.sku LIKE ${escapedPattern})`
        ),
      ],
    });
  }

  const variantFilterClauses = [
    'pv.product_id = Product.id',
    'pv.is_active = 1',
    'pv.deleted_at IS NULL',
  ];

  if (inStock === true) {
    variantFilterClauses.push('pv.stock_quantity > 0');
  }
  if (onSale === true) {
    variantFilterClauses.push('pv.sale_price IS NOT NULL');
  }
  if (minPrice !== undefined) {
    variantFilterClauses.push(`COALESCE(pv.sale_price, pv.price) >= ${Number(minPrice)}`);
  }
  if (maxPrice !== undefined) {
    variantFilterClauses.push(`COALESCE(pv.sale_price, pv.price) <= ${Number(maxPrice)}`);
  }

  if (variantFilterClauses.length > 3) {
    andConditions.push(
      sequelize.literal(`EXISTS (SELECT 1 FROM product_variants pv WHERE ${variantFilterClauses.join(' AND ')})`)
    );
  }

  where[Op.and] = andConditions;

  const minEffectivePriceExpr =
    '(SELECT MIN(COALESCE(pv.sale_price, pv.price)) FROM product_variants pv WHERE pv.product_id = Product.id AND pv.is_active = 1 AND pv.deleted_at IS NULL)';

  let order;
  switch (sort) {
    case 'featured':
      order = [
        ['isFeatured', 'DESC'],
        ['publishedAt', 'DESC'],
        ['created_at', 'DESC'],
      ];
      break;
    case 'price_asc':
      order = [
        [sequelize.literal(minEffectivePriceExpr), 'ASC'],
        ['created_at', 'DESC'],
      ];
      break;
    case 'price_desc':
      order = [
        [sequelize.literal(minEffectivePriceExpr), 'DESC'],
        ['created_at', 'DESC'],
      ];
      break;
    case 'name_asc':
      order = [['name', 'ASC']];
      break;
    case 'newest':
    default:
      order = [
        ['publishedAt', 'DESC'],
        ['created_at', 'DESC'],
      ];
      break;
  }

  const offset = (page - 1) * limit;

  const { count: totalItems, rows: idRows } = await Product.findAndCountAll({
    attributes: ['id'],
    where,
    order,
    limit,
    offset,
  });

  if (!idRows.length) {
    return {
      items: [],
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  const orderedIds = idRows.map((r) => r.id);

  const products = await Product.findAll({
    where: { id: { [Op.in]: orderedIds } },
    include: [
      {
        model: ProductVariant,
        as: 'variants',
        where: { isActive: true },
        required: true,
      },
      {
        model: ProductMedia,
        as: 'media',
        required: false,
      },
    ],
  });

  const productById = new Map(products.map((p) => [p.id, p]));

  const items = orderedIds
    .map((id) => productById.get(id))
    .filter(Boolean)
    .map((product) => {
      const sortedVariants = [...(product.variants || [])]
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder)
        .map(formatVariant);

      const sortedMedia = [...(product.media || [])]
        .sort(
          (a, b) =>
            Number(b.isPrimary) - Number(a.isPrimary) ||
            a.sortOrder - b.sortOrder ||
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .map(formatMediaItem);

      const primaryMedia = selectPrimaryMedia(sortedMedia);
      const { pricing, availability } = buildPricingAndAvailability(product, sortedVariants);
      const cat = visibleById.get(product.categoryId);

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        shortDescription: product.shortDescription || null,
        productType: product.productType,
        isFeatured: Boolean(product.isFeatured),
        category: formatCategorySummary(cat, rootMap),
        primaryMedia,
        pricing,
        availability,
        hasCertificate: Boolean(product.certificateUrl),
        publishedAt: product.publishedAt || null,
      };
    });

  return {
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

export async function getProductBySlug(slug) {
  const normalizedSlug = String(slug).trim().toLowerCase();
  const { rootMap, visibleById, visibleIds } = await loadVisibleCategories();

  if (!visibleIds.length) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }

  const product = await Product.findOne({
    where: {
      slug: normalizedSlug,
      status: PRODUCT_STATUSES.ACTIVE,
      categoryId: { [Op.in]: visibleIds },
    },
    include: [
      {
        model: ProductVariant,
        as: 'variants',
        where: { isActive: true },
        required: true,
      },
      {
        model: ProductMedia,
        as: 'media',
        required: false,
      },
    ],
  });

  if (!product || !product.variants?.length) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }

  const variants = [...product.variants]
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder)
    .map(formatVariant);

  const media = [...(product.media || [])]
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) ||
        a.sortOrder - b.sortOrder ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .map(formatMediaItem);

  const { defaultVariantId, pricing, availability } = buildPricingAndAvailability(product, variants);
  const category = visibleById.get(product.categoryId);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    productType: product.productType,
    isFeatured: Boolean(product.isFeatured),
    shortDescription: product.shortDescription || null,
    description: product.description || null,
    traditionalSignificance: product.traditionalSignificance || null,
    wearingInstructions: product.wearingInstructions || null,
    careInstructions: product.careInstructions || null,
    specifications: parseJsonField(product.specifications, []),
    variantOptions: parseJsonField(product.variantOptions, []),
    category: formatCategorySummary(category, rootMap),
    media,
    certificate: formatCertificate(product),
    tax: {
      gstInclusive: true,
      gstRate: formatMoney(product.gstRate),
      hsnCode: product.hsnCode || null,
    },
    shipping: formatShipping(product),
    seo: formatSeo(product),
    pricing,
    availability,
    defaultVariantId,
    variants,
    publishedAt: product.publishedAt || null,
  };
}
