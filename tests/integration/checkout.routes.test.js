import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../app.js';
import {
  sequelize,
  User,
  UserAddress,
  Category,
  Product,
  ProductVariant,
  ProductMedia,
  Coupon,
  Order,
  OrderItem,
} from '../../models/index.js';
import { ACCESS_COOKIE_NAME, signAccessToken } from '../../services/token.service.js';
import razorpayService, { computePaymentSignature } from '../../services/razorpay.service.js';
import emailService from '../../services/email.service.js';
import { AppError } from '../../utils/http.js';

describe('Checkout & Razorpay Payments (INR & USD) integration tests (/api/v1/checkout & /api/v1/webhooks/razorpay)', () => {
  const runTag = crypto.randomBytes(3).toString('hex').toUpperCase();
  const slug = (name) => `chktest-${runTag.toLowerCase()}-${name}`;
  const sku = (code) => `CHK-${runTag}-${code}`;
  const TEST_KEY_ID = 'rzp_test_japaika_key_id';
  const TEST_KEY_SECRET = 'rzp_test_japaika_secret_key_32_chars';
  const TEST_WEBHOOK_SECRET = 'rzp_test_japaika_webhook_secret_32';

  const createdOrderIds = [];
  const createdProductIds = [];
  const createdCategoryIds = [];
  const createdCouponIds = [];
  const createdUserIds = [];

  let customer;
  let customerCookie;
  let otherCustomer;
  let otherCookie;
  let inAddress;
  let usAddress;
  let category;
  let gemstoneVariant;
  let lowDollarVariant;
  let coupon;

  let rzpCreateMock;
  let confirmEmailMock;
  let rzpOrderCounter = 0;
  let failNextRazorpayCreate = false;

  before(async () => {
    process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    customer = await User.create({
      email: `checkout.${runTag.toLowerCase()}@japaika-test.local`,
      fullName: 'Ananya Sharma',
      phone: '+919876543210',
      isEmailVerified: true,
      status: 'active',
    });
    createdUserIds.push(customer.id);
    customerCookie = `${ACCESS_COOKIE_NAME}=${signAccessToken(customer)}`;

    otherCustomer = await User.create({
      email: `otherchk.${runTag.toLowerCase()}@japaika-test.local`,
      fullName: 'Other Buyer',
      isEmailVerified: true,
      status: 'active',
    });
    createdUserIds.push(otherCustomer.id);
    otherCookie = `${ACCESS_COOKIE_NAME}=${signAccessToken(otherCustomer)}`;

    inAddress = await UserAddress.create({
      userId: customer.id,
      label: 'home',
      fullName: 'Ananya Sharma',
      phone: '+919876543210',
      addressLine1: 'Flat 402, Lotus Residency',
      city: 'Bengaluru',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      postalCode: '560038',
      country: 'IN',
      isDefault: true,
    });

    usAddress = await UserAddress.create({
      userId: customer.id,
      label: 'work',
      fullName: 'Ananya Sharma',
      phone: '+14155552671',
      addressLine1: '742 Harbor Way',
      city: 'San Francisco',
      district: 'San Francisco County',
      state: 'California',
      postalCode: '94107',
      country: 'US',
      isDefault: false,
    });

    category = await Category.create({
      name: `Checkout Gemstones ${runTag}`,
      slug: slug('gemstones'),
      isActive: true,
      sortOrder: 1,
    });
    createdCategoryIds.push(category.id);

    const p1 = await Product.create({
      categoryId: category.id,
      name: `Certified Yellow Sapphire ${runTag}`,
      slug: slug('yellow-sapphire'),
      productType: 'simple',
      status: 'active',
      gstRate: 3.0,
      hsnCode: '7103',
    });
    createdProductIds.push(p1.id);

    gemstoneVariant = await ProductVariant.create({
      productId: p1.id,
      sku: sku('PUKH-1'),
      title: '5 Ratti',
      optionValues: { Weight: '5 Ratti' },
      optionSignature: 'default',
      prices: {
        IN: { currency: 'INR', price: 20000, salePrice: 18000 },
        US: { currency: 'USD', price: 250, salePrice: 200 },
      },
      stockQuantity: 3,
      lowStockThreshold: 1,
      isActive: true,
      isDefault: true,
    });

    await ProductMedia.create({
      productId: p1.id,
      mediaType: 'image',
      mediaUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/products/pukhraj.webp',
      mediaPublicId: 'japaika-ecom/products/pukhraj',
      isPrimary: true,
      sortOrder: 0,
    });

    const p2 = await Product.create({
      categoryId: category.id,
      name: `Tulsi Mala ${runTag}`,
      slug: slug('tulsi-mala'),
      productType: 'simple',
      status: 'active',
      gstRate: 5.0,
    });
    createdProductIds.push(p2.id);

    // Below $150 US free-shipping threshold ($40) to test $15 US flat shipping charge
    lowDollarVariant = await ProductVariant.create({
      productId: p2.id,
      sku: sku('TULSI-1'),
      title: 'Default',
      optionSignature: 'default',
      prices: {
        IN: { currency: 'INR', price: 800, salePrice: null },
        US: { currency: 'USD', price: 40, salePrice: null },
      },
      stockQuantity: 5,
      lowStockThreshold: 2,
      isActive: true,
      isDefault: true,
    });

    coupon = await Coupon.create({
      code: `CHK10_${runTag}`,
      description: '10% checkout test coupon',
      discountPercentage: 10.0,
      minCartSubtotalInr: 10000.0,
      minCartSubtotalUsd: 100.0,
      maxDiscountInr: 3000.0,
      maxDiscountUsd: 50.0,
      maxRedemptions: 10,
      redemptionCount: 0,
      visibility: 'public',
      isActive: true,
    });
    createdCouponIds.push(coupon.id);
  });

  beforeEach(() => {
    failNextRazorpayCreate = false;
    rzpCreateMock = mock.method(
      razorpayService,
      'createOrder',
      async ({ amountMinor, currency }) => {
        if (failNextRazorpayCreate) {
          failNextRazorpayCreate = false;
          throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', 'Razorpay upstream error');
        }
        rzpOrderCounter += 1;
        return {
          keyId: TEST_KEY_ID,
          razorpayOrderId: `order_rzp_${runTag}_${rzpOrderCounter}`,
          amountMinor,
          currency,
          status: 'created',
        };
      }
    );
    confirmEmailMock = mock.method(
      emailService,
      'sendOrderConfirmationEmail',
      async () => ({ delivered: true, transport: 'mock' })
    );
  });

  afterEach(() => {
    rzpCreateMock?.mock.restore();
    confirmEmailMock?.mock.restore();
  });

  after(async () => {
    // Clean up synthetic test orders & items
    if (createdOrderIds.length) {
      await OrderItem.destroy({ where: { orderId: createdOrderIds } });
      await Order.destroy({ where: { id: createdOrderIds } });
    }
    if (createdCouponIds.length) {
      await Coupon.destroy({ where: { id: createdCouponIds }, force: true });
    }
    if (createdProductIds.length) {
      await ProductMedia.destroy({ where: { productId: createdProductIds } });
      await ProductVariant.destroy({ where: { productId: createdProductIds }, force: true });
      await Product.destroy({ where: { id: createdProductIds }, force: true });
    }
    if (createdCategoryIds.length) {
      await Category.destroy({ where: { id: createdCategoryIds }, force: true });
    }
    if (createdUserIds.length) {
      await UserAddress.destroy({ where: { userId: createdUserIds }, force: true });
      await User.destroy({ where: { id: createdUserIds }, force: true });
    }
    await sequelize.close();
  });

  it('retrieves admin-controlled shipping configuration for IN (INR) and US (USD)', async () => {
    const inRes = await request(app).get('/api/v1/checkout/shipping?country=IN');
    assert.equal(inRes.status, 200);
    assert.equal(inRes.body.data.shipping.country, 'IN');
    assert.equal(inRes.body.data.shipping.currency, 'INR');
    assert.equal(inRes.body.data.shipping.flatCharge, '0.00');

    const usRes = await request(app).get('/api/v1/checkout/shipping?country=US');
    assert.equal(usRes.status, 200);
    assert.equal(usRes.body.data.shipping.country, 'US');
    assert.equal(usRes.body.data.shipping.currency, 'USD');
    assert.equal(usRes.body.data.shipping.flatCharge, '15.00');
    assert.equal(usRes.body.data.shipping.freeShippingThreshold, '150.00');
  });

  it('creates an IN (INR) checkout order, atomically deducts stock & increments coupon, and verifies payment idempotently', async () => {
    const createRes = await request(app)
      .post('/api/v1/checkout/create-order')
      .set('Cookie', customerCookie)
      .send({
        country: 'IN',
        addressId: inAddress.id,
        couponCode: coupon.code,
        customerNotes: 'Deliver before Thursday morning.',
        items: [{ variantId: gemstoneVariant.id, quantity: 1 }],
      });

    assert.equal(createRes.status, 201);
    const { order, razorpay } = createRes.body.data;
    createdOrderIds.push(order.id);

    // 18000 INR - 10% (1800 INR) = 16200.00 INR; shipping 0.00; embedded 3% GST on 16200 = 471.84 INR
    assert.equal(order.status, 'pending_payment');
    assert.equal(order.paymentStatus, 'pending');
    assert.equal(order.country, 'IN');
    assert.equal(order.currency, 'INR');
    assert.equal(order.pricing.subtotalAmount, '18000.00');
    assert.equal(order.pricing.discountAmount, '1800.00');
    assert.equal(order.pricing.shippingAmount, '0.00');
    assert.equal(order.pricing.taxAmount, '471.84');
    assert.equal(order.pricing.grandTotalAmount, '16200.00');
    assert.equal(order.shippingAddress.district, 'Bengaluru Urban');
    assert.equal(razorpay.amountMinor, 1620000);
    assert.equal(razorpay.currency, 'INR');

    // Verify stock was decremented (3 -> 2) and coupon redemption incremented (0 -> 1)
    const updatedVariant = await ProductVariant.findByPk(gemstoneVariant.id);
    const updatedCoupon = await Coupon.findByPk(coupon.id);
    assert.equal(updatedVariant.stockQuantity, 2);
    assert.equal(updatedCoupon.redemptionCount, 1);

    // Verify Razorpay payment signature
    const paymentId = `pay_${runTag}_IN1`;
    const validSignature = computePaymentSignature(
      { razorpayOrderId: razorpay.razorpayOrderId, razorpayPaymentId: paymentId },
      TEST_KEY_SECRET
    );

    const verifyRes = await request(app)
      .post('/api/v1/checkout/verify-payment')
      .set('Cookie', customerCookie)
      .send({
        orderNumber: order.orderNumber,
        razorpayOrderId: razorpay.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.data.order.status, 'confirmed');
    assert.equal(verifyRes.body.data.order.paymentStatus, 'paid');
    assert.equal(verifyRes.body.data.order.payment.razorpayPaymentId, paymentId);
    assert.ok(verifyRes.body.data.order.payment.paidAt);

    // Calling verify-payment a second time is idempotent (200 OK)
    const duplicateVerifyRes = await request(app)
      .post('/api/v1/checkout/verify-payment')
      .set('Cookie', customerCookie)
      .send({
        orderNumber: order.orderNumber,
        razorpayOrderId: razorpay.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      });
    assert.equal(duplicateVerifyRes.status, 200);
    assert.equal(duplicateVerifyRes.body.data.order.status, 'confirmed');
  });

  it('creates a US (USD) order with $15 flat shipping when below $150 threshold and confirms via Razorpay webhook', async () => {
    // 2 x $40 = $80 USD (< $150 threshold) -> $15 shipping -> $95.00 USD (9500 cents)
    const createRes = await request(app)
      .post('/api/v1/checkout/create-order')
      .set('Cookie', customerCookie)
      .send({
        country: 'US',
        addressId: usAddress.id,
        items: [{ variantId: lowDollarVariant.id, quantity: 2 }],
      });

    assert.equal(createRes.status, 201);
    const { order, razorpay } = createRes.body.data;
    createdOrderIds.push(order.id);

    assert.equal(order.country, 'US');
    assert.equal(order.currency, 'USD');
    assert.equal(order.pricing.subtotalAmount, '80.00');
    assert.equal(order.pricing.shippingAmount, '15.00');
    assert.equal(order.pricing.taxAmount, '0.00');
    assert.equal(order.pricing.grandTotalAmount, '95.00');
    assert.equal(razorpay.amountMinor, 9500);
    assert.equal(razorpay.currency, 'USD');

    // Confirm payment via POST /api/v1/webhooks/razorpay
    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_${runTag}_US1`,
            order_id: razorpay.razorpayOrderId,
          },
        },
      },
    });
    const webhookSig = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest('hex');

    const hookRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', webhookSig)
      .send(webhookBody);

    assert.equal(hookRes.status, 200);
    assert.equal(hookRes.body.data.handled, true);
    assert.equal(hookRes.body.data.orderNumber, order.orderNumber);

    const dbOrder = await Order.findByPk(order.id);
    assert.equal(dbOrder.status, 'confirmed');
    assert.equal(dbOrder.paymentStatus, 'paid');
    assert.equal(dbOrder.razorpayPaymentId, `pay_${runTag}_US1`);
  });

  it('rolls back stock and coupon deductions if Razorpay order creation fails, and rejects address country mismatch or insufficient stock', async () => {
    const beforeVariant = await ProductVariant.findByPk(gemstoneVariant.id);
    const beforeCoupon = await Coupon.findByPk(coupon.id);

    failNextRazorpayCreate = true;
    const failedGatewayRes = await request(app)
      .post('/api/v1/checkout/create-order')
      .set('Cookie', customerCookie)
      .send({
        country: 'IN',
        addressId: inAddress.id,
        couponCode: coupon.code,
        items: [{ variantId: gemstoneVariant.id, quantity: 1 }],
      });

    assert.equal(failedGatewayRes.status, 502);
    assert.equal(failedGatewayRes.body.error.code, 'PAYMENT_GATEWAY_ERROR');

    // Stock and coupon count must be completely unchanged after rollback
    const afterVariant = await ProductVariant.findByPk(gemstoneVariant.id);
    const afterCoupon = await Coupon.findByPk(coupon.id);
    assert.equal(afterVariant.stockQuantity, beforeVariant.stockQuantity);
    assert.equal(afterCoupon.redemptionCount, beforeCoupon.redemptionCount);

    // Address country mismatch (US address with IN checkout) -> 400 ADDRESS_COUNTRY_MISMATCH
    const mismatchRes = await request(app)
      .post('/api/v1/checkout/create-order')
      .set('Cookie', customerCookie)
      .send({
        country: 'IN',
        addressId: usAddress.id,
        items: [{ variantId: gemstoneVariant.id, quantity: 1 }],
      });
    assert.equal(mismatchRes.status, 400);
    assert.equal(mismatchRes.body.error.code, 'ADDRESS_COUNTRY_MISMATCH');

    // Insufficient stock (requesting 10 when 2 available) -> 409 INSUFFICIENT_STOCK
    const stockRes = await request(app)
      .post('/api/v1/checkout/create-order')
      .set('Cookie', customerCookie)
      .send({
        country: 'IN',
        addressId: inAddress.id,
        items: [{ variantId: gemstoneVariant.id, quantity: 10 }],
      });
    assert.equal(stockRes.status, 409);
    assert.equal(stockRes.body.error.code, 'INSUFFICIENT_STOCK');
  });

  it('supports customer order history, order details, payment retry on pending_payment orders, pre-shipment cancellation with stock/coupon restoration & permanent history preservation, and strict cross-user isolation', async () => {
    // 1. Create a pending_payment order in IN
    const pendingRes = await request(app)
      .post('/api/v1/checkout/create-order')
      .set('Cookie', customerCookie)
      .send({
        country: 'IN',
        addressId: inAddress.id,
        items: [{ variantId: gemstoneVariant.id, quantity: 1 }],
      });
    assert.equal(pendingRes.status, 201);
    const pendingOrder = pendingRes.body.data.order;
    createdOrderIds.push(pendingOrder.id);

    // 2. Retry payment on pending_payment order -> 200 OK with razorpay config
    const retryRes = await request(app)
      .post(`/api/v1/orders/${pendingOrder.orderNumber}/retry-payment`)
      .set('Cookie', customerCookie);
    assert.equal(retryRes.status, 200);
    assert.equal(retryRes.body.data.razorpay.razorpayOrderId, pendingOrder.payment.razorpayOrderId);
    assert.equal(retryRes.body.data.razorpay.amountMinor, 1800000);

    // 3. List customer orders -> includes all 3 created orders
    const listRes = await request(app).get('/api/v1/orders').set('Cookie', customerCookie);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.pagination.totalItems, 3);

    const confirmedListRes = await request(app)
      .get('/api/v1/orders?status=confirmed')
      .set('Cookie', customerCookie);
    assert.equal(confirmedListRes.status, 200);
    assert.equal(confirmedListRes.body.data.pagination.totalItems, 2);
    const confirmedOrderNumber = confirmedListRes.body.data.items.find(
      (o) => o.country === 'IN'
    ).orderNumber;

    // 4. Get full order details by orderNumber
    const detailRes = await request(app)
      .get(`/api/v1/orders/${confirmedOrderNumber}`)
      .set('Cookie', customerCookie);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.order.orderNumber, confirmedOrderNumber);
    assert.equal(detailRes.body.data.order.items.length, 1);

    // 5. Cross-user ownership isolation (BR-10): otherCustomer gets 404 on GET, retry-payment, and cancel
    assert.equal(
      (
        await request(app)
          .get(`/api/v1/orders/${confirmedOrderNumber}`)
          .set('Cookie', otherCookie)
      ).status,
      404
    );
    assert.equal(
      (
        await request(app)
          .post(`/api/v1/orders/${pendingOrder.orderNumber}/retry-payment`)
          .set('Cookie', otherCookie)
      ).status,
      404
    );
    assert.equal(
      (
        await request(app)
          .post(`/api/v1/orders/${confirmedOrderNumber}/cancel`)
          .set('Cookie', otherCookie)
          .send({ reason: 'Unauthorized attempt' })
      ).status,
      404
    );

    // 6. Cancel the confirmed paid IN order -> restores stock & coupon count, sets paymentStatus = refund_pending, and permanently preserves order & payment history
    const stockBeforeCancel = (await ProductVariant.findByPk(gemstoneVariant.id)).stockQuantity;
    const couponBeforeCancel = (await Coupon.findByPk(coupon.id)).redemptionCount;

    const cancelRes = await request(app)
      .post(`/api/v1/orders/${confirmedOrderNumber}/cancel`)
      .set('Cookie', customerCookie)
      .send({ reason: 'Ordered wrong ratti weight by mistake.' });

    assert.equal(cancelRes.status, 200);
    const cancelledOrder = cancelRes.body.data.order;
    assert.equal(cancelledOrder.status, 'cancelled');
    assert.equal(cancelledOrder.paymentStatus, 'refund_pending');
    assert.equal(cancelledOrder.payment.refundAmount, '16200.00');
    assert.ok(cancelledOrder.payment.razorpayOrderId);
    assert.ok(cancelledOrder.payment.razorpayPaymentId);
    assert.equal(cancelledOrder.cancellation.cancelledBy, 'customer');
    assert.equal(cancelledOrder.cancellation.reason, 'Ordered wrong ratti weight by mistake.');

    const stockAfterCancel = (await ProductVariant.findByPk(gemstoneVariant.id)).stockQuantity;
    const couponAfterCancel = (await Coupon.findByPk(coupon.id)).redemptionCount;
    assert.equal(stockAfterCancel, stockBeforeCancel + 1);
    assert.equal(couponAfterCancel, couponBeforeCancel - 1);

    // Cancelled order remains permanently preserved in database and GET /api/v1/orders
    const preservedRes = await request(app)
      .get(`/api/v1/orders/${confirmedOrderNumber}`)
      .set('Cookie', customerCookie);
    assert.equal(preservedRes.status, 200);
    assert.equal(preservedRes.body.data.order.status, 'cancelled');
    assert.equal(preservedRes.body.data.order.items.length, 1);

    // 7. Rejects self-cancellation once an order has progressed to 'shipped'
    const usOrderNumber = confirmedListRes.body.data.items.find(
      (o) => o.country === 'US'
    ).orderNumber;
    await Order.update({ status: 'shipped' }, { where: { orderNumber: usOrderNumber } });

    const shippedCancelRes = await request(app)
      .post(`/api/v1/orders/${usOrderNumber}/cancel`)
      .set('Cookie', customerCookie)
      .send({ reason: 'Too late to cancel' });
    assert.equal(shippedCancelRes.status, 409);
    assert.equal(shippedCancelRes.body.error.code, 'ORDER_CANNOT_BE_CANCELLED');
  });
});
