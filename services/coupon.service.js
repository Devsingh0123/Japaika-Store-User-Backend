import { Op } from 'sequelize';
import {
  sequelize,
  Coupon,
  Product,
  ProductVariant,
  ShippingSetting,
  COUPON_VISIBILITIES,
  PRODUCT_STATUSES,
  DEFAULT_COUNTRY,
} from '../models/index.js';
import {
  resolveMarket,
  extractMarketPricing,
  loadVisibleCategories,
} from './catalog.service.js';
import { AppError } from '../utils/http.js';

export function toMinorUnits(amount) {
  const num = Number(amount || 0);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function formatMinorUnits(minor) {
  const safeMinor = Math.max(0, Math.round(Number(minor || 0)));
  const whole = Math.floor(safeMinor / 100);
  const frac = String(safeMinor % 100).padStart(2, '0');
  return `${whole}.${frac}`;
}

export function calculatePercentageDiscountMinor({
  subtotalMinor,
  discountPercentage,
  maxDiscountMinor = null,
}) {
  if (subtotalMinor <= 0) {
    return {
      discountMinor: 0,
      payableSubtotalMinor: 0,
      discountAmount: '0.00',
      payableSubtotal: '0.00',
    };
  }

  const pctBps = BigInt(toMinorUnits(discountPercentage));
  const sub = BigInt(subtotalMinor);

  // Half-up rounding in integer minor units (100.00% = 10000 bps)
  let disc = (sub * pctBps + 5000n) / 10000n;

  if (maxDiscountMinor !== null && maxDiscountMinor !== undefined) {
    const cap = BigInt(maxDiscountMinor);
    if (disc > cap) {
      disc = cap;
    }
  }

  if (disc > sub) {
    disc = sub;
  }

  const discountMinor = Number(disc);
  const payableSubtotalMinor = Number(sub - disc);

  return {
    discountMinor,
    payableSubtotalMinor,
    discountAmount: formatMinorUnits(discountMinor),
    payableSubtotal: formatMinorUnits(payableSubtotalMinor),
  };
}

export async function calculateMarketShipping(
  country,
  payableSubtotalMinor,
  { hasValidItems = true, setting = null } = {}
) {
  const shippingSetting =
    setting ||
    (await ShippingSetting.findOne({
      where: { country },
    }));

  if (!shippingSetting || !shippingSetting.isActive) {
    return {
      isShippingAvailable: false,
      shippingMinor: 0,
      shippingAmount: '0.00',
      freeShippingThreshold: null,
      isFreeShipping: false,
      estimatedDeliveryDays: { min: null, max: null },
    };
  }

  const flatMinor = toMinorUnits(shippingSetting.flatCharge);
  const thresholdMinor =
    shippingSetting.freeShippingThreshold !== null &&
    shippingSetting.freeShippingThreshold !== undefined
      ? toMinorUnits(shippingSetting.freeShippingThreshold)
      : null;

  const isFreeShipping =
    !hasValidItems || (thresholdMinor !== null && payableSubtotalMinor >= thresholdMinor);
  const shippingMinor = isFreeShipping ? 0 : flatMinor;

  return {
    isShippingAvailable: true,
    shippingMinor,
    shippingAmount: formatMinorUnits(shippingMinor),
    freeShippingThreshold:
      thresholdMinor !== null ? formatMinorUnits(thresholdMinor) : null,
    isFreeShipping,
    estimatedDeliveryDays: {
      min: shippingSetting.estimatedDaysMin ?? null,
      max: shippingSetting.estimatedDaysMax ?? null,
    },
  };
}

export function getMarketCouponThresholds(coupon, market) {
  const isUs = market.country === 'US';
  const minRaw = isUs ? coupon.minCartSubtotalUsd : coupon.minCartSubtotalInr;
  const maxRaw = isUs ? coupon.maxDiscountUsd : coupon.maxDiscountInr;

  const minMinor = toMinorUnits(minRaw);
  const maxMinor =
    maxRaw !== null && maxRaw !== undefined && maxRaw !== '' ? toMinorUnits(maxRaw) : null;

  return {
    minSubtotalMinor: minMinor,
    minCartSubtotal: formatMinorUnits(minMinor),
    maxDiscountMinor: maxMinor,
    maxDiscount: maxMinor !== null ? formatMinorUnits(maxMinor) : null,
  };
}

function serializePublicCoupon(coupon, market) {
  const { minCartSubtotal, maxDiscount } = getMarketCouponThresholds(coupon, market);
  return {
    code: coupon.code,
    description: coupon.description ?? null,
    discountType: 'percentage',
    discountPercentage: formatMinorUnits(toMinorUnits(coupon.discountPercentage)),
    minCartSubtotal,
    maxDiscount,
    expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString() : null,
  };
}

export async function listPublicCoupons({ country = DEFAULT_COUNTRY } = {}) {
  const market = resolveMarket(country);
  const now = new Date();

  const rows = await Coupon.findAll({
    where: {
      isActive: true,
      visibility: COUPON_VISIBILITIES.PUBLIC,
      [Op.and]: [
        {
          [Op.or]: [{ expiresAt: { [Op.is]: null } }, { expiresAt: { [Op.gt]: now } }],
        },
        sequelize.literal(
          '(Coupon.max_redemptions IS NULL OR Coupon.redemption_count < Coupon.max_redemptions)'
        ),
      ],
    },
    order: [
      ['discountPercentage', 'DESC'],
      ['created_at', 'DESC'],
    ],
  });

  return {
    country: market.country,
    currency: market.currency,
    items: rows.map((row) => serializePublicCoupon(row, market)),
  };
}

export async function validateCartAndCoupon({
  country = DEFAULT_COUNTRY,
  couponCode = null,
  items = [],
} = {}) {
  const market = resolveMarket(country);
  const { visibleById } = await loadVisibleCategories();

  // Consolidate duplicate variantIds while preserving first-seen order
  const mergedQuantities = new Map();
  for (const item of items) {
    const prev = mergedQuantities.get(item.variantId) || 0;
    mergedQuantities.set(item.variantId, prev + Number(item.quantity));
  }

  const variantIds = [...mergedQuantities.keys()];
  const variantRows = variantIds.length
    ? await ProductVariant.findAll({
        where: { id: { [Op.in]: variantIds } },
        include: [
          {
            model: Product,
            as: 'product',
            required: false,
          },
        ],
      })
    : [];

  const variantById = new Map(variantRows.map((v) => [v.id, v]));

  const evaluatedItems = [];
  let subtotalMinor = 0;
  let itemCount = 0;
  let validItemCount = 0;
  let hasStockIssues = false;

  for (const [variantId, requestedQuantity] of mergedQuantities.entries()) {
    const variant = variantById.get(variantId);
    const product = variant?.product || null;

    const isCatalogVisible =
      Boolean(variant) &&
      Boolean(variant.isActive) &&
      Boolean(product) &&
      product.status === PRODUCT_STATUSES.ACTIVE &&
      Boolean(product.categoryId) &&
      visibleById.has(product.categoryId);

    const marketPrice = isCatalogVisible ? extractMarketPricing(variant.prices, market) : null;

    if (!isCatalogVisible || !marketPrice) {
      hasStockIssues = true;
      evaluatedItems.push({
        variantId,
        productId: product?.id ?? null,
        name: product?.name ?? null,
        slug: product?.slug ?? null,
        variantTitle: variant?.title ?? null,
        sku: variant?.sku ?? null,
        requestedQuantity,
        availableStock: 0,
        unitPrice: null,
        unitSalePrice: null,
        unitEffectivePrice: null,
        lineTotal: '0.00',
        isAvailable: false,
        hasSufficientStock: false,
      });
      continue;
    }

    const availableStock = Number(variant.stockQuantity || 0);
    const hasSufficientStock = availableStock > 0 && availableStock >= requestedQuantity;
    if (!hasSufficientStock) {
      hasStockIssues = true;
    }

    const unitPriceMinor = toMinorUnits(marketPrice.priceNum);
    const unitSaleMinor =
      marketPrice.saleNum !== null ? toMinorUnits(marketPrice.saleNum) : null;
    const unitEffectiveMinor = toMinorUnits(marketPrice.effectiveNum);
    const lineTotalMinor = unitEffectiveMinor * requestedQuantity;

    subtotalMinor += lineTotalMinor;
    itemCount += requestedQuantity;
    validItemCount += 1;

    evaluatedItems.push({
      variantId: variant.id,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      variantTitle: variant.title ?? null,
      sku: variant.sku,
      requestedQuantity,
      availableStock,
      unitPrice: formatMinorUnits(unitPriceMinor),
      unitSalePrice: unitSaleMinor !== null ? formatMinorUnits(unitSaleMinor) : null,
      unitEffectivePrice: formatMinorUnits(unitEffectiveMinor),
      lineTotal: formatMinorUnits(lineTotalMinor),
      isAvailable: true,
      hasSufficientStock,
    });
  }

  let appliedCoupon = null;
  let discountMinor = 0;
  let payableSubtotalMinor = subtotalMinor;

  const trimmedCode =
    couponCode !== null && couponCode !== undefined ? String(couponCode).trim().toUpperCase() : '';

  if (trimmedCode) {
    const coupon = await Coupon.findOne({
      where: {
        code: trimmedCode,
        isActive: true,
      },
    });

    if (!coupon) {
      throw new AppError(404, 'COUPON_NOT_FOUND', 'Invalid or inactive coupon code.');
    }

    const now = new Date();
    if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) {
      throw new AppError(400, 'COUPON_EXPIRED', 'This coupon has expired.');
    }

    const maxRedemptions =
      coupon.maxRedemptions !== null && coupon.maxRedemptions !== undefined
        ? Number(coupon.maxRedemptions)
        : null;
    const redemptionCount = Number(coupon.redemptionCount || 0);

    if (maxRedemptions !== null && redemptionCount >= maxRedemptions) {
      throw new AppError(
        400,
        'COUPON_USAGE_LIMIT_REACHED',
        'This coupon has reached its maximum redemption limit.'
      );
    }

    const thresholds = getMarketCouponThresholds(coupon, market);

    if (subtotalMinor < thresholds.minSubtotalMinor) {
      const shortfallMinor = thresholds.minSubtotalMinor - subtotalMinor;
      throw new AppError(
        400,
        'COUPON_MIN_SUBTOTAL_NOT_MET',
        `Minimum cart subtotal of ${market.currency} ${thresholds.minCartSubtotal} is required for coupon "${coupon.code}".`,
        [
          {
            field: 'couponCode',
            currency: market.currency,
            requiredMinSubtotal: thresholds.minCartSubtotal,
            currentSubtotal: formatMinorUnits(subtotalMinor),
            shortfallAmount: formatMinorUnits(shortfallMinor),
          },
        ]
      );
    }

    const calc = calculatePercentageDiscountMinor({
      subtotalMinor,
      discountPercentage: coupon.discountPercentage,
      maxDiscountMinor: thresholds.maxDiscountMinor,
    });

    discountMinor = calc.discountMinor;
    payableSubtotalMinor = calc.payableSubtotalMinor;

    appliedCoupon = {
      code: coupon.code,
      description: coupon.description ?? null,
      discountType: 'percentage',
      discountPercentage: formatMinorUnits(toMinorUnits(coupon.discountPercentage)),
      minCartSubtotal: thresholds.minCartSubtotal,
      maxDiscount: thresholds.maxDiscount,
      discountAmount: calc.discountAmount,
    };
  }

  const shippingQuote = await calculateMarketShipping(market.country, payableSubtotalMinor, {
    hasValidItems: validItemCount > 0,
  });
  const grandTotalMinor = payableSubtotalMinor + shippingQuote.shippingMinor;

  return {
    country: market.country,
    currency: market.currency,
    items: evaluatedItems,
    coupon: appliedCoupon,
    summary: {
      itemCount,
      subtotal: formatMinorUnits(subtotalMinor),
      discountAmount: formatMinorUnits(discountMinor),
      payableSubtotal: formatMinorUnits(payableSubtotalMinor),
      shippingAmount: shippingQuote.shippingAmount,
      freeShippingThreshold: shippingQuote.freeShippingThreshold,
      isFreeShipping: shippingQuote.isFreeShipping,
      grandTotal: formatMinorUnits(grandTotalMinor),
      hasStockIssues,
    },
  };
}
