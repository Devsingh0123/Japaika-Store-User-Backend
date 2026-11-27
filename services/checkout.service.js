import crypto from 'node:crypto';
import { Op } from 'sequelize';
import {
  sequelize,
  User,
  UserAddress,
  Product,
  ProductVariant,
  ProductMedia,
  Coupon,
  ShippingSetting,
  Order,
  OrderItem,
  PRODUCT_STATUSES,
  PRODUCT_MEDIA_TYPES,
  DEFAULT_COUNTRY,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  CANCELLED_BY_ACTORS,
} from '../models/index.js';
import {
  resolveMarket,
  parseJsonField,
  extractMarketPricing,
  loadVisibleCategories,
} from './catalog.service.js';
import {
  toMinorUnits,
  formatMinorUnits,
  calculatePercentageDiscountMinor,
  calculateMarketShipping,
  getMarketCouponThresholds,
} from './coupon.service.js';
import { toOrderAddressSnapshot } from './profile.service.js';
import { assignInvoiceNumberForOrder } from './invoice.service.js';
import razorpayService from './razorpay.service.js';
import emailService from './email.service.js';
import { AppError } from '../utils/http.js';

export function generateOrderNumber(now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `JPK-${yyyy}${mm}${dd}-${randomSuffix}`;
}

export function calculateEmbeddedGstMinor(taxableAmountMinor, gstRate, country) {
  if (country !== 'IN') return 0;
  const rateNum = Number(gstRate || 0);
  if (!Number.isFinite(rateNum) || rateNum <= 0 || taxableAmountMinor <= 0) return 0;
  // GST-inclusive price: tax = amount - amount / (1 + rate/100)
  return Math.round(taxableAmountMinor - (taxableAmountMinor * 100) / (100 + rateNum));
}

function selectPrimaryImageUrl(mediaItems = []) {
  if (!mediaItems.length) return null;
  const sorted = [...mediaItems].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder
  );
  const primaryImage =
    sorted.find((m) => m.isPrimary && m.mediaType === PRODUCT_MEDIA_TYPES.IMAGE) ||
    sorted.find((m) => m.mediaType === PRODUCT_MEDIA_TYPES.IMAGE);
  return primaryImage ? primaryImage.mediaUrl : null;
}

export function serializeOrderItem(item) {
  return {
    id: item.id,
    productId: item.productId ?? null,
    variantId: item.variantId ?? null,
    productName: item.productName,
    productSlug: item.productSlug,
    variantTitle: item.variantTitle ?? null,
    sku: item.sku,
    optionValues: parseJsonField(item.optionValues, null),
    imageUrl: item.imageUrl ?? null,
    hsnCode: item.hsnCode ?? null,
    gstRate: formatMinorUnits(toMinorUnits(item.gstRate)),
    quantity: Number(item.quantity),
    unitPrice: formatMinorUnits(toMinorUnits(item.unitPrice)),
    unitSalePrice:
      item.unitSalePrice !== null && item.unitSalePrice !== undefined
        ? formatMinorUnits(toMinorUnits(item.unitSalePrice))
        : null,
    unitEffectivePrice: formatMinorUnits(toMinorUnits(item.unitEffectivePrice)),
    lineTotal: formatMinorUnits(toMinorUnits(item.lineTotal)),
    taxAmount: formatMinorUnits(toMinorUnits(item.taxAmount)),
  };
}

export function serializeOrderDetail(order) {
  const items = Array.isArray(order.items) ? order.items.map(serializeOrderItem) : [];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    invoice: {
      invoiceNumber: order.invoiceNumber ?? null,
      issuedAt: order.invoiceIssuedAt ? new Date(order.invoiceIssuedAt).toISOString() : null,
    },
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    country: order.country,
    currency: order.currency,
    pricing: {
      subtotalAmount: formatMinorUnits(toMinorUnits(order.subtotalAmount)),
      discountAmount: formatMinorUnits(toMinorUnits(order.discountAmount)),
      shippingAmount: formatMinorUnits(toMinorUnits(order.shippingAmount)),
      taxAmount: formatMinorUnits(toMinorUnits(order.taxAmount)),
      grandTotalAmount: formatMinorUnits(toMinorUnits(order.grandTotalAmount)),
    },
    couponCode: order.couponCode ?? null,
    couponSnapshot: parseJsonField(order.couponSnapshot, null),
    shippingAddress: parseJsonField(order.shippingAddress, null),
    customerNotes: order.customerNotes ?? null,
    payment: {
      method: order.paymentMethod,
      status: order.paymentStatus,
      razorpayOrderId: order.razorpayOrderId ?? null,
      razorpayPaymentId: order.razorpayPaymentId ?? null,
      paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
      refundAmount:
        order.refundAmount !== null && order.refundAmount !== undefined
          ? formatMinorUnits(toMinorUnits(order.refundAmount))
          : null,
      razorpayRefundId: order.razorpayRefundId ?? null,
      refundedAt: order.refundedAt ? new Date(order.refundedAt).toISOString() : null,
    },
    tracking: {
      courierName: order.courierName ?? null,
      awbNumber: order.awbNumber ?? null,
      trackingUrl: order.trackingUrl ?? null,
      shippedAt: order.shippedAt ? new Date(order.shippedAt).toISOString() : null,
      deliveredAt: order.deliveredAt ? new Date(order.deliveredAt).toISOString() : null,
    },
    cancellation:
      order.status === ORDER_STATUSES.CANCELLED
        ? {
            cancelledAt: order.cancelledAt ? new Date(order.cancelledAt).toISOString() : null,
            cancelledBy: order.cancelledBy ?? null,
            reason: order.cancellationReason ?? null,
          }
        : null,
    items,
    createdAt: (order.created_at ?? order.createdAt)
      ? new Date(order.created_at ?? order.createdAt).toISOString()
      : null,
    updatedAt: (order.updated_at ?? order.updatedAt)
      ? new Date(order.updated_at ?? order.updatedAt).toISOString()
      : null,
  };
}

// --- Shipping Configuration Preview ---

export async function getShippingConfig({ country = DEFAULT_COUNTRY } = {}) {
  const market = resolveMarket(country);
  const setting = await ShippingSetting.findOne({
    where: { country: market.country },
  });

  if (!setting || !setting.isActive) {
    throw new AppError(
      400,
      'SHIPPING_UNAVAILABLE',
      `Shipping is currently unavailable for ${market.country}.`
    );
  }

  return {
    country: setting.country,
    currency: setting.currency,
    flatCharge: formatMinorUnits(toMinorUnits(setting.flatCharge)),
    freeShippingThreshold:
      setting.freeShippingThreshold !== null && setting.freeShippingThreshold !== undefined
        ? formatMinorUnits(toMinorUnits(setting.freeShippingThreshold))
        : null,
    estimatedDaysMin: setting.estimatedDaysMin ?? null,
    estimatedDaysMax: setting.estimatedDaysMax ?? null,
    isActive: Boolean(setting.isActive),
  };
}

// --- Atomic Checkout Order Creation ---

export async function createCheckoutOrder(
  userId,
  { country = DEFAULT_COUNTRY, addressId, items = [], couponCode = null, customerNotes = null } = {}
) {
  const market = resolveMarket(country);

  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
  }
  if (user.status !== 'active') {
    throw new AppError(
      403,
      'ACCOUNT_SUSPENDED',
      'Your account has been suspended. Please contact support.'
    );
  }

  const address = await UserAddress.findOne({
    where: { id: addressId, userId },
  });
  if (!address) {
    throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Selected shipping address was not found.');
  }
  if (address.country !== market.country) {
    throw new AppError(
      400,
      'ADDRESS_COUNTRY_MISMATCH',
      `Shipping address country (${address.country}) must match checkout country (${market.country}).`
    );
  }

  const shippingSetting = await ShippingSetting.findOne({
    where: { country: market.country },
  });
  if (!shippingSetting || !shippingSetting.isActive) {
    throw new AppError(
      400,
      'SHIPPING_UNAVAILABLE',
      `Shipping is currently unavailable for ${market.country}.`
    );
  }

  const { visibleById } = await loadVisibleCategories();

  // Consolidate duplicate variantIds
  const mergedQuantities = new Map();
  for (const item of items) {
    const prev = mergedQuantities.get(item.variantId) || 0;
    mergedQuantities.set(item.variantId, prev + Number(item.quantity));
  }
  const variantIds = [...mergedQuantities.keys()];

  return sequelize.transaction(async (transaction) => {
    const lockedVariants = await ProductVariant.findAll({
      where: { id: { [Op.in]: variantIds } },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    const variantById = new Map(lockedVariants.map((v) => [v.id, v]));

    const productIds = [...new Set(lockedVariants.map((v) => v.productId))];
    const products = productIds.length
      ? await Product.findAll({
          where: { id: { [Op.in]: productIds } },
          include: [{ model: ProductMedia, as: 'media', required: false }],
          transaction,
        })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    let subtotalMinor = 0;
    const preparedItems = [];

    for (const [variantId, quantity] of mergedQuantities.entries()) {
      const variant = variantById.get(variantId);
      const product = variant ? productById.get(variant.productId) : null;

      const isVisible =
        Boolean(variant) &&
        Boolean(variant.isActive) &&
        Boolean(product) &&
        product.status === PRODUCT_STATUSES.ACTIVE &&
        Boolean(product.categoryId) &&
        visibleById.has(product.categoryId);

      const marketPrice = isVisible ? extractMarketPricing(variant.prices, market) : null;

      if (!isVisible || !marketPrice) {
        throw new AppError(
          400,
          'ITEM_UNAVAILABLE',
          `One or more items in your cart are unavailable in ${market.country}.`,
          [{ variantId }]
        );
      }

      const currentStock = Number(variant.stockQuantity || 0);
      if (currentStock < quantity) {
        throw new AppError(
          409,
          'INSUFFICIENT_STOCK',
          `Insufficient stock for "${product.name}". Available: ${currentStock}, requested: ${quantity}.`,
          [{ variantId, availableStock: currentStock, requestedQuantity: quantity }]
        );
      }

      const unitPriceMinor = toMinorUnits(marketPrice.priceNum);
      const unitSaleMinor =
        marketPrice.saleNum !== null ? toMinorUnits(marketPrice.saleNum) : null;
      const unitEffectiveMinor = toMinorUnits(marketPrice.effectiveNum);
      const lineTotalMinor = unitEffectiveMinor * quantity;

      subtotalMinor += lineTotalMinor;

      preparedItems.push({
        variant,
        product,
        quantity,
        unitPriceMinor,
        unitSaleMinor,
        unitEffectiveMinor,
        lineTotalMinor,
        imageUrl: selectPrimaryImageUrl(product.media || []),
      });
    }

    // Coupon validation & atomic redemption increment
    let couponId = null;
    let appliedCouponCode = null;
    let couponSnapshot = null;
    let discountMinor = 0;
    let payableSubtotalMinor = subtotalMinor;

    const trimmedCode =
      couponCode !== null && couponCode !== undefined ? String(couponCode).trim().toUpperCase() : '';

    if (trimmedCode) {
      const coupon = await Coupon.findOne({
        where: { code: trimmedCode, isActive: true },
        lock: transaction.LOCK.UPDATE,
        transaction,
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
      couponId = coupon.id;
      appliedCouponCode = coupon.code;
      couponSnapshot = {
        code: coupon.code,
        discountPercentage: formatMinorUnits(toMinorUnits(coupon.discountPercentage)),
        discountAmount: calc.discountAmount,
      };

      await coupon.increment('redemptionCount', { by: 1, transaction });
    }

    // Deduct stock on each locked variant
    for (const item of preparedItems) {
      await item.variant.decrement('stockQuantity', { by: item.quantity, transaction });
    }

    // Shipping & embedded GST calculation
    const shippingQuote = await calculateMarketShipping(market.country, payableSubtotalMinor, {
      hasValidItems: true,
      setting: shippingSetting,
    });
    const shippingMinor = shippingQuote.shippingMinor;
    const totalGrandMinor = payableSubtotalMinor + shippingMinor;

    let totalTaxMinor = 0;
    const orderId = crypto.randomUUID();
    const orderNumber = generateOrderNumber();

    const orderItemPayloads = preparedItems.map((item) => {
      // Proportional post-discount taxable value for embedded GST in IN
      const discountedLineMinor =
        subtotalMinor > 0
          ? Math.round((item.lineTotalMinor * payableSubtotalMinor) / subtotalMinor)
          : item.lineTotalMinor;
      const itemTaxMinor = calculateEmbeddedGstMinor(
        discountedLineMinor,
        item.product.gstRate,
        market.country
      );
      totalTaxMinor += itemTaxMinor;

      return {
        id: crypto.randomUUID(),
        orderId,
        productId: item.product.id,
        variantId: item.variant.id,
        productName: item.product.name,
        productSlug: item.product.slug,
        variantTitle: item.variant.title ?? null,
        sku: item.variant.sku,
        optionValues: parseJsonField(item.variant.optionValues, null),
        imageUrl: item.imageUrl,
        hsnCode: item.product.hsnCode ?? null,
        gstRate: formatMinorUnits(toMinorUnits(item.product.gstRate)),
        quantity: item.quantity,
        unitPrice: formatMinorUnits(item.unitPriceMinor),
        unitSalePrice: item.unitSaleMinor !== null ? formatMinorUnits(item.unitSaleMinor) : null,
        unitEffectivePrice: formatMinorUnits(item.unitEffectiveMinor),
        lineTotal: formatMinorUnits(item.lineTotalMinor),
        taxAmount: formatMinorUnits(itemTaxMinor),
      };
    });

    const addressSnapshot = toOrderAddressSnapshot(address);

    const order = await Order.create(
      {
        id: orderId,
        orderNumber,
        userId,
        country: market.country,
        currency: market.currency,
        status: ORDER_STATUSES.PENDING_PAYMENT,
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        paymentStatus: PAYMENT_STATUSES.PENDING,
        subtotalAmount: formatMinorUnits(subtotalMinor),
        discountAmount: formatMinorUnits(discountMinor),
        shippingAmount: formatMinorUnits(shippingMinor),
        taxAmount: formatMinorUnits(totalTaxMinor),
        grandTotalAmount: formatMinorUnits(totalGrandMinor),
        couponId,
        couponCode: appliedCouponCode,
        couponSnapshot,
        shippingAddress: addressSnapshot,
        customerNotes: customerNotes ? String(customerNotes).trim() : null,
      },
      { transaction }
    );

    await OrderItem.bulkCreate(orderItemPayloads, { transaction });

    const rzpOrder = await razorpayService.createOrder({
      amountMinor: totalGrandMinor,
      currency: market.currency,
      receipt: orderNumber,
      notes: {
        orderId: order.id,
        orderNumber,
      },
    });

    await order.update({ razorpayOrderId: rzpOrder.razorpayOrderId }, { transaction });

    const fullOrder = await Order.findByPk(order.id, {
      include: [{ model: OrderItem, as: 'items' }],
      transaction,
    });

    return {
      order: serializeOrderDetail(fullOrder),
      razorpay: {
        keyId: rzpOrder.keyId,
        razorpayOrderId: rzpOrder.razorpayOrderId,
        amountMinor: totalGrandMinor,
        currency: market.currency,
        prefill: {
          name: addressSnapshot.fullName,
          email: user.email,
          contact: addressSnapshot.phone,
        },
      },
    };
  });
}

// --- Idempotent Payment Verification & Webhook Confirmation ---

async function confirmOrderPaymentTransaction({
  orderWhere,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature = null,
}) {
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({
      where: orderWhere,
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    }

    if (razorpayOrderId && order.razorpayOrderId !== razorpayOrderId) {
      throw new AppError(
        400,
        'PAYMENT_ORDER_MISMATCH',
        'Razorpay order ID does not match this order.'
      );
    }

    // Idempotent: already paid
    if (order.paymentStatus === PAYMENT_STATUSES.PAID) {
      const fullPaid = await Order.findByPk(order.id, {
        include: [
          { model: OrderItem, as: 'items' },
          { model: User, as: 'user', attributes: ['id', 'email'] },
        ],
        transaction,
      });
      return { order: fullPaid, newlyConfirmed: false };
    }

    const now = new Date();

    // If order was already cancelled before payment arrived, preserve payment history and mark refund_pending
    if (order.status === ORDER_STATUSES.CANCELLED) {
      await order.update(
        {
          paymentStatus: PAYMENT_STATUSES.REFUND_PENDING,
          razorpayPaymentId: razorpayPaymentId || order.razorpayPaymentId,
          razorpaySignature: razorpaySignature || order.razorpaySignature,
          paidAt: now,
        },
        { transaction }
      );
    } else {
      await order.update(
        {
          status:
            order.status === ORDER_STATUSES.PENDING_PAYMENT
              ? ORDER_STATUSES.CONFIRMED
              : order.status,
          paymentStatus: PAYMENT_STATUSES.PAID,
          razorpayPaymentId: razorpayPaymentId || order.razorpayPaymentId,
          razorpaySignature: razorpaySignature || order.razorpaySignature,
          paidAt: now,
        },
        { transaction }
      );
      await assignInvoiceNumberForOrder(order, { issuedAt: now, transaction });
    }

    const updatedOrder = await Order.findByPk(order.id, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: User, as: 'user', attributes: ['id', 'email'] },
      ],
      transaction,
    });

    return { order: updatedOrder, newlyConfirmed: true };
  });
}

export async function verifyCheckoutPayment(
  userId,
  { orderNumber, razorpayOrderId, razorpayPaymentId, razorpaySignature }
) {
  const isValid = razorpayService.verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  if (!isValid) {
    throw new AppError(
      400,
      'INVALID_PAYMENT_SIGNATURE',
      'Payment signature verification failed.'
    );
  }

  const normalizedOrderNumber = String(orderNumber).trim().toUpperCase();

  const { order, newlyConfirmed } = await confirmOrderPaymentTransaction({
    orderWhere: { orderNumber: normalizedOrderNumber, userId },
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  const serialized = serializeOrderDetail(order);

  if (newlyConfirmed && order.paymentStatus === PAYMENT_STATUSES.PAID && order.user?.email) {
    try {
      await emailService.sendOrderConfirmationEmail({
        to: order.user.email,
        order: serialized,
      });
    } catch {
      // Never fail confirmed payment response on email transport error
    }
  }

  return { order: serialized };
}

export async function handleRazorpayWebhook(rawBody, signatureHeader) {
  const isValid = razorpayService.verifyWebhookSignature(rawBody, signatureHeader);
  if (!isValid) {
    throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Razorpay webhook signature.');
  }

  const payload =
    typeof rawBody === 'string' || Buffer.isBuffer(rawBody)
      ? JSON.parse(rawBody.toString('utf8'))
      : rawBody;

  const eventName = payload?.event || '';
  if (eventName !== 'payment.captured' && eventName !== 'order.paid') {
    return { received: true, handled: false, event: eventName };
  }

  const paymentEntity = payload?.payload?.payment?.entity || null;
  const orderEntity = payload?.payload?.order?.entity || null;
  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || null;
  const razorpayPaymentId = paymentEntity?.id || null;

  if (!razorpayOrderId) {
    return { received: true, handled: false, event: eventName };
  }

  const existing = await Order.findOne({ where: { razorpayOrderId } });
  if (!existing) {
    return { received: true, handled: false, event: eventName };
  }

  const { order, newlyConfirmed } = await confirmOrderPaymentTransaction({
    orderWhere: { id: existing.id },
    razorpayOrderId,
    razorpayPaymentId,
  });

  const serialized = serializeOrderDetail(order);

  if (newlyConfirmed && order.paymentStatus === PAYMENT_STATUSES.PAID && order.user?.email) {
    try {
      await emailService.sendOrderConfirmationEmail({
        to: order.user.email,
        order: serialized,
      });
    } catch {
      // Non-blocking email error
    }
  }

  return {
    received: true,
    handled: true,
    event: eventName,
    orderNumber: serialized.orderNumber,
  };
}

// --- Customer Order History, Details, Payment Retry & Pre-Shipment Cancellation ---

export function serializeOrderSummary(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    invoice: {
      invoiceNumber: order.invoiceNumber ?? null,
      issuedAt: order.invoiceIssuedAt ? new Date(order.invoiceIssuedAt).toISOString() : null,
    },
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    country: order.country,
    currency: order.currency,
    grandTotalAmount: formatMinorUnits(toMinorUnits(order.grandTotalAmount)),
    itemCount,
    itemsPreview: items.slice(0, 3).map((item) => ({
      productName: item.productName,
      productSlug: item.productSlug,
      variantTitle: item.variantTitle ?? null,
      quantity: Number(item.quantity),
      imageUrl: item.imageUrl ?? null,
    })),
    tracking: {
      courierName: order.courierName ?? null,
      awbNumber: order.awbNumber ?? null,
      trackingUrl: order.trackingUrl ?? null,
    },
    createdAt: (order.created_at ?? order.createdAt)
      ? new Date(order.created_at ?? order.createdAt).toISOString()
      : null,
  };
}

export async function listCustomerOrders(
  userId,
  { page = 1, limit = 10, status } = {}
) {
  const where = { userId };
  if (status) {
    where.status = status;
  }

  const offset = (page - 1) * limit;

  const { count: totalItems, rows } = await Order.findAndCountAll({
    where,
    include: [{ model: OrderItem, as: 'items' }],
    distinct: true,
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  return {
    items: rows.map(serializeOrderSummary),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

export async function getCustomerOrderByNumber(userId, orderNumber) {
  const normalized = String(orderNumber).trim().toUpperCase();

  const order = await Order.findOne({
    where: {
      orderNumber: normalized,
      userId,
    },
    include: [{ model: OrderItem, as: 'items' }],
  });

  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }

  return {
    order: serializeOrderDetail(order),
  };
}

export async function retryCustomerOrderPayment(userId, orderNumber) {
  const normalized = String(orderNumber).trim().toUpperCase();

  const order = await Order.findOne({
    where: {
      orderNumber: normalized,
      userId,
    },
    include: [
      { model: OrderItem, as: 'items' },
      { model: User, as: 'user', attributes: ['id', 'email'] },
    ],
  });

  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }

  if (order.paymentStatus === PAYMENT_STATUSES.PAID) {
    throw new AppError(409, 'ORDER_ALREADY_PAID', 'This order has already been paid.');
  }

  if (order.status !== ORDER_STATUSES.PENDING_PAYMENT) {
    throw new AppError(
      409,
      'ORDER_NOT_PAYABLE',
      `Payment retry is only allowed for pending_payment orders (current status: ${order.status}).`
    );
  }

  const { keyId } = razorpayService.getRazorpayConfig();
  const amountMinor = toMinorUnits(order.grandTotalAmount);
  let razorpayOrderId = order.razorpayOrderId;

  if (!razorpayOrderId) {
    const rzpOrder = await razorpayService.createOrder({
      amountMinor,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: {
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
    });
    razorpayOrderId = rzpOrder.razorpayOrderId;
    await order.update({ razorpayOrderId });
  }

  const shippingAddr = parseJsonField(order.shippingAddress, {});

  return {
    order: serializeOrderDetail(order),
    razorpay: {
      keyId,
      razorpayOrderId,
      amountMinor,
      currency: order.currency,
      prefill: {
        name: shippingAddr?.fullName ?? null,
        email: order.user?.email ?? null,
        contact: shippingAddr?.phone ?? null,
      },
    },
  };
}

export async function cancelCustomerOrder(
  userId,
  orderNumber,
  { reason = null } = {}
) {
  const normalized = String(orderNumber).trim().toUpperCase();

  const { fullOrder, userEmail } = await sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({
      where: {
        orderNumber: normalized,
        userId,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    }

    if (order.status === ORDER_STATUSES.CANCELLED) {
      throw new AppError(409, 'ORDER_ALREADY_CANCELLED', 'This order is already cancelled.');
    }

    const cancellableStatuses = [
      ORDER_STATUSES.PENDING_PAYMENT,
      ORDER_STATUSES.CONFIRMED,
    ];

    if (!cancellableStatuses.includes(order.status)) {
      throw new AppError(
        409,
        'ORDER_CANNOT_BE_CANCELLED',
        `Order cannot be self-cancelled once it is ${order.status}.`
      );
    }

    const orderItems = await OrderItem.findAll({
      where: { orderId: order.id },
      transaction,
    });

    if (!order.stockRestored) {
      for (const item of orderItems) {
        if (item.variantId) {
          await ProductVariant.increment('stockQuantity', {
            by: Number(item.quantity),
            where: { id: item.variantId },
            paranoid: false,
            transaction,
          });
        }
      }

      if (order.couponId) {
        await sequelize.query(
          'UPDATE coupons SET redemption_count = CASE WHEN redemption_count > 0 THEN redemption_count - 1 ELSE 0 END WHERE id = ?',
          {
            replacements: [order.couponId],
            transaction,
          }
        );
      }
    }

    const wasPaid = order.paymentStatus === PAYMENT_STATUSES.PAID;
    const nextPaymentStatus = wasPaid
      ? PAYMENT_STATUSES.REFUND_PENDING
      : order.paymentStatus;
    const refundAmount = wasPaid
      ? order.grandTotalAmount
      : order.refundAmount;

    await order.update(
      {
        status: ORDER_STATUSES.CANCELLED,
        paymentStatus: nextPaymentStatus,
        cancelledAt: new Date(),
        cancelledBy: CANCELLED_BY_ACTORS.CUSTOMER,
        cancellationReason: reason ? String(reason).trim() : 'Cancelled by customer.',
        stockRestored: true,
        refundAmount,
      },
      { transaction }
    );

    const reloaded = await Order.findByPk(order.id, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: User, as: 'user', attributes: ['id', 'email'] },
      ],
      transaction,
    });

    return {
      fullOrder: reloaded,
      userEmail: reloaded.user?.email ?? null,
    };
  });

  const serialized = serializeOrderDetail(fullOrder);

  if (userEmail) {
    try {
      await emailService.sendOrderCancelledEmail({
        to: userEmail,
        order: serialized,
      });
    } catch {
      // Non-blocking email transport error
    }
  }

  return {
    order: serialized,
  };
}
