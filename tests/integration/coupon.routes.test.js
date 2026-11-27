import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../app.js';
import {
  sequelize,
  Category,
  Product,
  ProductVariant,
  Coupon,
} from '../../models/index.js';

describe('Customer Coupon & Browser-Cart Validation API integration tests (/api/v1/coupons)', () => {
  const runTag = crypto.randomBytes(3).toString('hex').toUpperCase();
  const code = (prefix) => `${prefix}_${runTag}`;
  const slug = (name) => `cpntest-${runTag.toLowerCase()}-${name}`;
  const sku = (name) => `CPN-${runTag}-${name}`;

  const createdCouponIds = [];
  const createdProductIds = [];
  const createdCategoryIds = [];

  let activeCategory;
  let globalVariant;
  let indiaOnlyVariant;

  let publicCoupon;
  let hiddenCoupon;
  let expiredCoupon;
  let exhaustedCoupon;
  let inactiveCoupon;

  before(async () => {
    const now = Date.now();
    const oneDayAhead = new Date(now + 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    activeCategory = await Category.create({
      name: `Coupon Test Cat ${runTag}`,
      slug: slug('gemstones'),
      isActive: true,
      sortOrder: 1,
    });
    createdCategoryIds.push(activeCategory.id);

    const product1 = await Product.create({
      categoryId: activeCategory.id,
      name: `Ceylon Sapphire ${runTag}`,
      slug: slug('ceylon-sapphire'),
      productType: 'simple',
      status: 'active',
      gstRate: 3.0,
    });
    createdProductIds.push(product1.id);

    globalVariant = await ProductVariant.create({
      productId: product1.id,
      sku: sku('SAPPHIRE-1'),
      title: '5 Ratti',
      optionSignature: 'default',
      prices: {
        IN: { currency: 'INR', price: 20000, salePrice: 18000 },
        US: { currency: 'USD', price: 300, salePrice: 250 },
      },
      stockQuantity: 3,
      lowStockThreshold: 2,
      isActive: true,
      isDefault: true,
    });

    const product2 = await Product.create({
      categoryId: activeCategory.id,
      name: `India Only Rudraksha ${runTag}`,
      slug: slug('india-rudraksha'),
      productType: 'simple',
      status: 'active',
      gstRate: 5.0,
    });
    createdProductIds.push(product2.id);

    indiaOnlyVariant = await ProductVariant.create({
      productId: product2.id,
      sku: sku('RUD-IN-ONLY'),
      title: 'Default',
      optionSignature: 'default',
      prices: {
        IN: { currency: 'INR', price: 2000, salePrice: null },
      },
      stockQuantity: 5,
      lowStockThreshold: 2,
      isActive: true,
      isDefault: true,
    });

    // 1. Active public coupon (10% off, min 15000 INR / 200 USD, cap 2500 INR / 40 USD)
    publicCoupon = await Coupon.create({
      code: code('FESTIVE10'),
      description: '10% off festive spiritual collection',
      discountPercentage: 10.0,
      minCartSubtotalInr: 15000.0,
      minCartSubtotalUsd: 200.0,
      maxDiscountInr: 2500.0,
      maxDiscountUsd: 40.0,
      maxRedemptions: 50,
      redemptionCount: 10,
      visibility: 'public',
      isActive: true,
      expiresAt: oneDayAhead,
    });
    createdCouponIds.push(publicCoupon.id);

    // 2. Active hidden ("personal") coupon (20% off, min 10000 INR / 100 USD, no cap)
    hiddenCoupon = await Coupon.create({
      code: code('VIP20'),
      description: 'Hidden VIP 20% discount for any customer with the code',
      discountPercentage: 20.0,
      minCartSubtotalInr: 10000.0,
      minCartSubtotalUsd: 100.0,
      maxDiscountInr: null,
      maxDiscountUsd: null,
      maxRedemptions: null,
      redemptionCount: 0,
      visibility: 'hidden',
      isActive: true,
      expiresAt: null,
    });
    createdCouponIds.push(hiddenCoupon.id);

    // 3. Expired coupon
    expiredCoupon = await Coupon.create({
      code: code('EXPIRED15'),
      discountPercentage: 15.0,
      minCartSubtotalInr: 1000.0,
      minCartSubtotalUsd: 10.0,
      visibility: 'public',
      isActive: true,
      expiresAt: oneDayAgo,
    });
    createdCouponIds.push(expiredCoupon.id);

    // 4. Exhausted coupon (redemptionCount >= maxRedemptions)
    exhaustedCoupon = await Coupon.create({
      code: code('MAXED25'),
      discountPercentage: 25.0,
      minCartSubtotalInr: 1000.0,
      minCartSubtotalUsd: 10.0,
      maxRedemptions: 5,
      redemptionCount: 5,
      visibility: 'public',
      isActive: true,
    });
    createdCouponIds.push(exhaustedCoupon.id);

    // 5. Inactive coupon
    inactiveCoupon = await Coupon.create({
      code: code('OFF30'),
      discountPercentage: 30.0,
      minCartSubtotalInr: 1000.0,
      minCartSubtotalUsd: 10.0,
      visibility: 'public',
      isActive: false,
    });
    createdCouponIds.push(inactiveCoupon.id);
  });

  after(async () => {
    if (createdCouponIds.length) {
      await Coupon.destroy({ where: { id: createdCouponIds }, force: true });
    }
    if (createdProductIds.length) {
      await ProductVariant.destroy({ where: { productId: createdProductIds }, force: true });
      await Product.destroy({ where: { id: createdProductIds }, force: true });
    }
    if (createdCategoryIds.length) {
      await Category.destroy({ where: { id: createdCategoryIds }, force: true });
    }
    await sequelize.close();
  });

  describe('GET /api/v1/coupons (Public Storefront Coupon Listing)', () => {
    it('lists only active, non-expired, non-exhausted public coupons with market-specific thresholds (IN/INR & US/USD)', async () => {
      const resIn = await request(app).get('/api/v1/coupons');
      assert.equal(resIn.status, 200);
      assert.equal(resIn.body.data.country, 'IN');
      assert.equal(resIn.body.data.currency, 'INR');

      const codesIn = resIn.body.data.items.map((c) => c.code);
      assert.ok(codesIn.includes(publicCoupon.code));
      // Hidden, expired, exhausted, and inactive coupons must NEVER appear in public listing
      assert.equal(codesIn.includes(hiddenCoupon.code), false);
      assert.equal(codesIn.includes(expiredCoupon.code), false);
      assert.equal(codesIn.includes(exhaustedCoupon.code), false);
      assert.equal(codesIn.includes(inactiveCoupon.code), false);

      const pubIn = resIn.body.data.items.find((c) => c.code === publicCoupon.code);
      assert.equal(pubIn.discountPercentage, '10.00');
      assert.equal(pubIn.minCartSubtotal, '15000.00');
      assert.equal(pubIn.maxDiscount, '2500.00');

      const resUs = await request(app).get('/api/v1/coupons?country=US');
      assert.equal(resUs.status, 200);
      assert.equal(resUs.body.data.country, 'US');
      assert.equal(resUs.body.data.currency, 'USD');
      const pubUs = resUs.body.data.items.find((c) => c.code === publicCoupon.code);
      assert.equal(pubUs.minCartSubtotal, '200.00');
      assert.equal(pubUs.maxDiscount, '40.00');
    });
  });

  describe('POST /api/v1/coupons/validate (Browser-Cart & Public/Hidden Coupon Validator)', () => {
    it('validates cart items with a public coupon and applies regional maxDiscount cap in IN (INR)', async () => {
      // 2 x 18000 INR = 36000 INR subtotal; 10% = 3600 INR, capped at 2500 INR -> payable 33500.00
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({
          country: 'IN',
          couponCode: publicCoupon.code.toLowerCase(),
          items: [{ variantId: globalVariant.id, quantity: 2 }],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.country, 'IN');
      assert.equal(res.body.data.currency, 'INR');
      assert.equal(res.body.data.items.length, 1);
      assert.equal(res.body.data.items[0].unitEffectivePrice, '18000.00');
      assert.equal(res.body.data.items[0].lineTotal, '36000.00');
      assert.equal(res.body.data.items[0].hasSufficientStock, true);

      assert.equal(res.body.data.coupon.code, publicCoupon.code);
      assert.equal(res.body.data.coupon.discountAmount, '2500.00');
      assert.deepEqual(res.body.data.summary, {
        itemCount: 2,
        subtotal: '36000.00',
        discountAmount: '2500.00',
        payableSubtotal: '33500.00',
        shippingAmount: '0.00',
        freeShippingThreshold: '0.00',
        isFreeShipping: true,
        grandTotal: '33500.00',
        hasStockIssues: false,
      });
    });

    it('allows any customer who knows a hidden coupon code to redeem it in US (USD)', async () => {
      // 1 x 250 USD = 250 USD subtotal; VIP20 (20% off, min 100 USD, no cap) -> 50.00 USD discount -> 200.00 USD payable (>= 150 USD free shipping threshold)
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({
          country: 'US',
          couponCode: hiddenCoupon.code,
          items: [{ variantId: globalVariant.id, quantity: 1 }],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.country, 'US');
      assert.equal(res.body.data.currency, 'USD');
      assert.equal(res.body.data.coupon.code, hiddenCoupon.code);
      assert.equal(res.body.data.coupon.discountAmount, '50.00');
      assert.deepEqual(res.body.data.summary, {
        itemCount: 1,
        subtotal: '250.00',
        discountAmount: '50.00',
        payableSubtotal: '200.00',
        shippingAmount: '0.00',
        freeShippingThreshold: '150.00',
        isFreeShipping: true,
        grandTotal: '200.00',
        hasStockIssues: false,
      });
    });

    it('flags stock shortages and market-unavailable variants (no INR fallback in US)', async () => {
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({
          country: 'US',
          items: [
            { variantId: globalVariant.id, quantity: 5 }, // Only 3 in stock
            { variantId: indiaOnlyVariant.id, quantity: 1 }, // Not priced in US
          ],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.summary.hasStockIssues, true);
      assert.equal(res.body.data.items[0].isAvailable, true);
      assert.equal(res.body.data.items[0].hasSufficientStock, false);
      assert.equal(res.body.data.items[0].availableStock, 3);

      assert.equal(res.body.data.items[1].isAvailable, false);
      assert.equal(res.body.data.items[1].unitEffectivePrice, null);
      assert.equal(res.body.data.items[1].lineTotal, '0.00');
    });

    it('rejects unknown/inactive, expired, exhausted, and below-minimum-subtotal coupons with clear error codes', async () => {
      // Below minCartSubtotal (2000 INR < 15000 INR required for FESTIVE10)
      const minSubRes = await request(app)
        .post('/api/v1/coupons/validate')
        .send({
          country: 'IN',
          couponCode: publicCoupon.code,
          items: [{ variantId: indiaOnlyVariant.id, quantity: 1 }],
        });
      assert.equal(minSubRes.status, 400);
      assert.equal(minSubRes.body.error.code, 'COUPON_MIN_SUBTOTAL_NOT_MET');
      assert.equal(minSubRes.body.error.details[0].requiredMinSubtotal, '15000.00');
      assert.equal(minSubRes.body.error.details[0].shortfallAmount, '13000.00');

      // Expired coupon
      const expiredRes = await request(app)
        .post('/api/v1/coupons/validate')
        .send({
          country: 'IN',
          couponCode: expiredCoupon.code,
          items: [{ variantId: globalVariant.id, quantity: 1 }],
        });
      assert.equal(expiredRes.status, 400);
      assert.equal(expiredRes.body.error.code, 'COUPON_EXPIRED');

      // Exhausted coupon
      const exhaustedRes = await request(app)
        .post('/api/v1/coupons/validate')
        .send({
          country: 'IN',
          couponCode: exhaustedCoupon.code,
          items: [{ variantId: globalVariant.id, quantity: 1 }],
        });
      assert.equal(exhaustedRes.status, 400);
      assert.equal(exhaustedRes.body.error.code, 'COUPON_USAGE_LIMIT_REACHED');

      // Inactive coupon -> 404 COUPON_NOT_FOUND
      const inactiveRes = await request(app)
        .post('/api/v1/coupons/validate')
        .send({
          country: 'IN',
          couponCode: inactiveCoupon.code,
          items: [{ variantId: globalVariant.id, quantity: 1 }],
        });
      assert.equal(inactiveRes.status, 404);
      assert.equal(inactiveRes.body.error.code, 'COUPON_NOT_FOUND');
    });
  });
});
