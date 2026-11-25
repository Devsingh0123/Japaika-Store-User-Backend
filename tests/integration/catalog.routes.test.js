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
  ProductMedia,
} from '../../models/index.js';

describe('Customer Catalog API integration tests (/api/v1/categories & /api/v1/products — IN/INR & US/USD regional pricing)', () => {
  const runTag = crypto.randomBytes(4).toString('hex');
  const slug = (name) => `cattest-${runTag}-${name}`;
  const sku = (code) => `CT-${runTag.toUpperCase()}-${code}`;

  const createdCategoryIds = [];
  const createdProductIds = [];

  let rootGemstones;
  let subSapphire;
  let subInactive;
  let rootEmpty;
  let rootInactive;
  let subUnderInactiveRoot;

  let activeVariantProduct;
  let activeSimpleProduct;
  let outOfStockProduct;
  let draftProduct;
  let archivedProduct;
  let inactiveCategoryProduct;
  let noActiveVariantsProduct;

  before(async () => {
    rootGemstones = await Category.create({
      name: `Gemstones ${runTag}`,
      slug: slug('gemstones'),
      description: 'Natural certified gemstones',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/categories/gem.jpg',
      imagePublicId: 'japaika-ecom/categories/gem',
      isActive: true,
      sortOrder: 1,
      seoTitle: 'Buy Natural Gemstones',
      seoDescription: 'Lab certified Vedic gemstones',
    });
    createdCategoryIds.push(rootGemstones.id);

    subSapphire = await Category.create({
      parentId: rootGemstones.id,
      name: `Yellow Sapphire ${runTag}`,
      slug: slug('yellow-sapphire'),
      description: 'Ceylon Pukhraj stones',
      isActive: true,
      sortOrder: 1,
      seoTitle: 'Yellow Sapphire (Pukhraj)',
      seoDescription: 'Certified Yellow Sapphire',
    });
    createdCategoryIds.push(subSapphire.id);

    subInactive = await Category.create({
      parentId: rootGemstones.id,
      name: `Hidden Sub ${runTag}`,
      slug: slug('hidden-sub'),
      isActive: false,
      sortOrder: 2,
    });
    createdCategoryIds.push(subInactive.id);

    rootEmpty = await Category.create({
      name: `Empty Cat ${runTag}`,
      slug: slug('empty-cat'),
      isActive: true,
      sortOrder: 2,
    });
    createdCategoryIds.push(rootEmpty.id);

    rootInactive = await Category.create({
      name: `Inactive Root ${runTag}`,
      slug: slug('inactive-root'),
      isActive: false,
      sortOrder: 3,
    });
    createdCategoryIds.push(rootInactive.id);

    subUnderInactiveRoot = await Category.create({
      parentId: rootInactive.id,
      name: `Orphaned Active Sub ${runTag}`,
      slug: slug('orphaned-sub'),
      isActive: true,
      sortOrder: 1,
    });
    createdCategoryIds.push(subUnderInactiveRoot.id);

    // 1. Active Variant Product (priced in both IN and US)
    activeVariantProduct = await Product.create({
      categoryId: subSapphire.id,
      name: `Ceylon Yellow Sapphire ${runTag}`,
      slug: slug('ceylon-pukhraj'),
      productType: 'variant',
      status: 'active',
      shortDescription: 'Unheated Ceylon Pukhraj stone',
      description: 'Authentic natural yellow sapphire mined in Sri Lanka.',
      traditionalSignificance: 'Traditionally associated with Jupiter.',
      wearingInstructions: 'Wear on the index finger on Thursday morning.',
      careInstructions: 'Clean gently with lukewarm soapy water.',
      specifications: [
        { key: 'Origin', value: 'Sri Lanka (Ceylon)' },
        { key: 'Treatment', value: 'Unheated' },
      ],
      variantOptions: [{ name: 'Weight', values: ['5 Ratti', '7 Ratti'] }],
      gstRate: 3.0,
      hsnCode: '7103',
      certificateUrl: 'https://res.cloudinary.com/demo/raw/upload/japaika-ecom/certificates/pukhraj.pdf',
      certificatePublicId: 'japaika-ecom/certificates/pukhraj',
      certificateResourceType: 'raw',
      certificateLabel: 'IGI Lab Certified',
      weightGrams: 50,
      lengthCm: 10.5,
      widthCm: 8.0,
      heightCm: 4.5,
      shippingNotes: 'Insured tamper-proof delivery',
      isFeatured: true,
      seoTitle: 'Ceylon Yellow Sapphire Pukhraj',
      seoDescription: 'Certified unheated yellow sapphire',
      publishedAt: new Date('2026-11-23T08:00:00.000Z'),
    });
    createdProductIds.push(activeVariantProduct.id);

    await ProductVariant.bulkCreate([
      {
        productId: activeVariantProduct.id,
        sku: sku('PUKH-5R'),
        title: '5 Ratti',
        optionValues: { Weight: '5 Ratti' },
        optionSignature: 'weight=5 ratti',
        prices: {
          IN: { currency: 'INR', price: 20000, salePrice: 18000 },
          US: { currency: 'USD', price: 280, salePrice: 252 },
        },
        stockQuantity: 2,
        lowStockThreshold: 3,
        isActive: true,
        isDefault: true,
        sortOrder: 0,
      },
      {
        productId: activeVariantProduct.id,
        sku: sku('PUKH-7R'),
        title: '7 Ratti',
        optionValues: { Weight: '7 Ratti' },
        optionSignature: 'weight=7 ratti',
        prices: {
          IN: { currency: 'INR', price: 28000, salePrice: null },
          US: { currency: 'USD', price: 390, salePrice: null },
        },
        stockQuantity: 0, // Out-of-stock active variant -> visible, not purchasable
        lowStockThreshold: 2,
        isActive: true,
        isDefault: false,
        sortOrder: 1,
      },
      {
        productId: activeVariantProduct.id,
        sku: sku('PUKH-HIDDEN'),
        title: '9 Ratti Hidden',
        optionValues: { Weight: '9 Ratti' },
        optionSignature: 'weight=9 ratti',
        prices: {
          IN: { currency: 'INR', price: 35000, salePrice: null },
          US: { currency: 'USD', price: 480, salePrice: null },
        },
        stockQuantity: 5,
        isActive: false, // Inactive variant -> must never be exposed
        isDefault: false,
        sortOrder: 2,
      },
    ]);

    await ProductMedia.bulkCreate([
      {
        productId: activeVariantProduct.id,
        mediaType: 'image',
        mediaUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/products/pukhraj-1.webp',
        mediaPublicId: 'japaika-ecom/products/pukhraj-1',
        mimeType: 'image/webp',
        altText: 'Ceylon Yellow Sapphire front view',
        isPrimary: true,
        sortOrder: 0,
      },
      {
        productId: activeVariantProduct.id,
        mediaType: 'video',
        mediaUrl: 'https://res.cloudinary.com/demo/video/upload/japaika-ecom/products/pukhraj-360.mp4',
        mediaPublicId: 'japaika-ecom/products/pukhraj-360',
        thumbnailUrl: 'https://res.cloudinary.com/demo/video/upload/japaika-ecom/products/pukhraj-360.jpg',
        mimeType: 'video/mp4',
        durationSeconds: 12.5,
        altText: '360 degree gemstone showcase',
        isPrimary: false,
        sortOrder: 1,
      },
    ]);

    // 2. Active Simple Product (priced in both IN and US; not on sale in IN, on sale in US)
    activeSimpleProduct = await Product.create({
      categoryId: rootGemstones.id,
      name: `Alpha Rudraksha Mala ${runTag}`,
      slug: slug('alpha-rudraksha-mala'),
      productType: 'simple',
      status: 'active',
      shortDescription: '5 Mukhi Nepali Rudraksha mala',
      gstRate: 5.0,
      isFeatured: false,
      publishedAt: new Date('2026-11-23T09:00:00.000Z'),
    });
    createdProductIds.push(activeSimpleProduct.id);

    await ProductVariant.create({
      productId: activeSimpleProduct.id,
      sku: sku('RUD-5M'),
      title: 'Default',
      optionValues: null,
      optionSignature: 'default',
      prices: {
        IN: { currency: 'INR', price: 1500, salePrice: null },
        US: { currency: 'USD', price: 30, salePrice: 24 },
      },
      stockQuantity: 15,
      lowStockThreshold: 5,
      isActive: true,
      isDefault: true,
      sortOrder: 0,
    });

    await ProductMedia.create({
      productId: activeSimpleProduct.id,
      mediaType: 'image',
      mediaUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/products/rudraksha.jpg',
      mediaPublicId: 'japaika-ecom/products/rudraksha',
      isPrimary: true,
      sortOrder: 0,
    });

    // 3. Active Out-of-Stock Simple Product (INDIA ONLY — no US pricing -> must never fall back to INR in US)
    outOfStockProduct = await Product.create({
      categoryId: rootGemstones.id,
      name: `Rare Blue Sapphire ${runTag}`,
      slug: slug('rare-blue-sapphire'),
      productType: 'simple',
      status: 'active',
      gstRate: 3.0,
      isFeatured: false,
      publishedAt: new Date('2026-11-23T07:00:00.000Z'),
    });
    createdProductIds.push(outOfStockProduct.id);

    await ProductVariant.create({
      productId: outOfStockProduct.id,
      sku: sku('NEELAM-OOS'),
      optionValues: null,
      optionSignature: 'default',
      prices: {
        IN: { currency: 'INR', price: 45000, salePrice: null },
      },
      stockQuantity: 0,
      lowStockThreshold: 1,
      isActive: true,
      isDefault: true,
      sortOrder: 0,
    });

    // 4. Hidden products: draft, archived, under inactive category, zero active variants
    draftProduct = await Product.create({
      categoryId: rootGemstones.id,
      name: `Draft Secret Stone ${runTag}`,
      slug: slug('draft-secret-stone'),
      productType: 'simple',
      status: 'draft',
    });
    createdProductIds.push(draftProduct.id);
    await ProductVariant.create({
      productId: draftProduct.id,
      sku: sku('DRAFT-1'),
      optionSignature: 'default',
      prices: { IN: { currency: 'INR', price: 999, salePrice: null } },
      stockQuantity: 10,
      isActive: true,
      isDefault: true,
    });

    archivedProduct = await Product.create({
      categoryId: rootGemstones.id,
      name: `Archived Stone ${runTag}`,
      slug: slug('archived-stone'),
      productType: 'simple',
      status: 'archived',
    });
    createdProductIds.push(archivedProduct.id);
    await ProductVariant.create({
      productId: archivedProduct.id,
      sku: sku('ARCH-1'),
      optionSignature: 'default',
      prices: { IN: { currency: 'INR', price: 999, salePrice: null } },
      stockQuantity: 10,
      isActive: true,
      isDefault: true,
    });

    inactiveCategoryProduct = await Product.create({
      categoryId: subUnderInactiveRoot.id,
      name: `Inactive Parent Product ${runTag}`,
      slug: slug('inactive-parent-prod'),
      productType: 'simple',
      status: 'active',
    });
    createdProductIds.push(inactiveCategoryProduct.id);
    await ProductVariant.create({
      productId: inactiveCategoryProduct.id,
      sku: sku('INACT-CAT'),
      optionSignature: 'default',
      prices: { IN: { currency: 'INR', price: 1200, salePrice: null } },
      stockQuantity: 5,
      isActive: true,
      isDefault: true,
    });

    noActiveVariantsProduct = await Product.create({
      categoryId: rootGemstones.id,
      name: `No Active Variants ${runTag}`,
      slug: slug('no-active-variants'),
      productType: 'simple',
      status: 'active',
    });
    createdProductIds.push(noActiveVariantsProduct.id);
    await ProductVariant.create({
      productId: noActiveVariantsProduct.id,
      sku: sku('NO-ACTIVE-VAR'),
      optionSignature: 'default',
      prices: { IN: { currency: 'INR', price: 1000, salePrice: null } },
      stockQuantity: 5,
      isActive: false,
      isDefault: true,
    });
  });

  after(async () => {
    if (createdProductIds.length) {
      await ProductMedia.destroy({ where: { productId: createdProductIds } });
      await ProductVariant.destroy({ where: { productId: createdProductIds }, force: true });
      await Product.destroy({ where: { id: createdProductIds }, force: true });
    }
    for (const id of [...createdCategoryIds].reverse()) {
      await Category.destroy({ where: { id }, force: true });
    }
    await sequelize.close();
  });

  describe('GET /api/v1/categories & GET /api/v1/categories/:slug', () => {
    it('returns active categories with market-aware product counts (default IN vs US), SEO, and no internal fields', async () => {
      const resIn = await request(app).get('/api/v1/categories');
      assert.equal(resIn.status, 200);
      assert.equal(resIn.body.success, true);

      const gemIn = resIn.body.data.items.find((c) => c.id === rootGemstones.id);
      const empty = resIn.body.data.items.find((c) => c.id === rootEmpty.id);
      const inactive = resIn.body.data.items.find((c) => c.id === rootInactive.id);

      assert.ok(gemIn);
      assert.ok(empty);
      assert.equal(inactive, undefined);
      assert.equal(gemIn.imagePublicId, undefined);
      assert.equal(gemIn.productCount, 3); // 3 products priced in IN
      assert.deepEqual(gemIn.seo, {
        title: 'Buy Natural Gemstones',
        description: 'Lab certified Vedic gemstones',
      });
      assert.equal(gemIn.subcategories.length, 1);
      assert.equal(gemIn.subcategories[0].id, subSapphire.id);
      assert.equal(gemIn.subcategories[0].productCount, 1);

      // In US market, India-only outOfStockProduct is excluded from category counts
      const resUs = await request(app).get('/api/v1/categories?country=US');
      assert.equal(resUs.status, 200);
      const gemUs = resUs.body.data.items.find((c) => c.id === rootGemstones.id);
      assert.equal(gemUs.productCount, 2);
    });

    it('hides empty categories when includeEmpty=false', async () => {
      const res = await request(app).get('/api/v1/categories?includeEmpty=false');
      assert.equal(res.status, 200);

      const items = res.body.data.items;
      assert.ok(items.some((c) => c.id === rootGemstones.id));
      assert.equal(items.some((c) => c.id === rootEmpty.id), false);
    });

    it('retrieves active root and subcategory by slug and returns 404 for inactive or orphaned slugs', async () => {
      const rootRes = await request(app).get(`/api/v1/categories/${rootGemstones.slug}`);
      assert.equal(rootRes.status, 200);
      assert.equal(rootRes.body.data.category.productCount, 3);
      assert.equal(rootRes.body.data.category.subcategories.length, 1);

      const rootUsRes = await request(app).get(`/api/v1/categories/${rootGemstones.slug}?country=us`);
      assert.equal(rootUsRes.status, 200);
      assert.equal(rootUsRes.body.data.category.productCount, 2);

      const subRes = await request(app).get(`/api/v1/categories/${subSapphire.slug}`);
      assert.equal(subRes.status, 200);
      assert.equal(subRes.body.data.category.parent.id, rootGemstones.id);
      assert.equal(subRes.body.data.category.parent.slug, rootGemstones.slug);

      assert.equal((await request(app).get(`/api/v1/categories/${rootInactive.slug}`)).status, 404);
      assert.equal((await request(app).get(`/api/v1/categories/${subInactive.slug}`)).status, 404);
      assert.equal((await request(app).get(`/api/v1/categories/${subUnderInactiveRoot.slug}`)).status, 404);
      assert.equal((await request(app).get('/api/v1/categories/bad_slug!')).status, 400);
    });
  });

  describe('GET /api/v1/products (Regional Pricing: Default IN/INR & US/USD)', () => {
    it('defaults to India (IN / INR) and exposes only published active products with IN pricing', async () => {
      const res = await request(app).get(`/api/v1/products?category=${rootGemstones.slug}`);
      assert.equal(res.status, 200);

      const ids = res.body.data.items.map((p) => p.id);
      assert.equal(res.body.data.pagination.totalItems, 3);
      assert.ok(ids.includes(activeVariantProduct.id));
      assert.ok(ids.includes(activeSimpleProduct.id));
      assert.ok(ids.includes(outOfStockProduct.id));
      assert.equal(ids.includes(draftProduct.id), false);
      assert.equal(ids.includes(archivedProduct.id), false);
      assert.equal(ids.includes(inactiveCategoryProduct.id), false);
      assert.equal(ids.includes(noActiveVariantsProduct.id), false);

      const variantItem = res.body.data.items.find((p) => p.id === activeVariantProduct.id);
      assert.equal(variantItem.pricing.country, 'IN');
      assert.equal(variantItem.pricing.currency, 'INR');
      assert.equal(variantItem.pricing.price, '20000.00');
      assert.equal(variantItem.pricing.salePrice, '18000.00');
      assert.equal(variantItem.pricing.effectivePrice, '18000.00');
      assert.equal(variantItem.pricing.minPrice, '18000.00');
      assert.equal(variantItem.pricing.maxPrice, '28000.00');
      assert.equal(variantItem.pricing.discountPercent, 10);
      assert.equal(variantItem.pricing.gstInclusive, true);
      assert.equal(variantItem.primaryMedia.mediaType, 'image');
      assert.equal(variantItem.primaryMedia.mediaPublicId, undefined);
      assert.equal(variantItem.hasCertificate, true);
      assert.equal(variantItem.availability.variantCount, 2);
    });

    it('returns USA (US / USD) prices when country=US and never falls back to INR when US pricing is missing', async () => {
      const res = await request(app).get(`/api/v1/products?category=${rootGemstones.slug}&country=US`);
      assert.equal(res.status, 200);

      const ids = res.body.data.items.map((p) => p.id);
      assert.equal(res.body.data.pagination.totalItems, 2);
      assert.ok(ids.includes(activeVariantProduct.id));
      assert.ok(ids.includes(activeSimpleProduct.id));
      // India-only product must NOT appear in US listing
      assert.equal(ids.includes(outOfStockProduct.id), false);

      const variantItem = res.body.data.items.find((p) => p.id === activeVariantProduct.id);
      assert.equal(variantItem.pricing.country, 'US');
      assert.equal(variantItem.pricing.currency, 'USD');
      assert.equal(variantItem.pricing.price, '280.00');
      assert.equal(variantItem.pricing.salePrice, '252.00');
      assert.equal(variantItem.pricing.effectivePrice, '252.00');
      assert.equal(variantItem.pricing.minPrice, '252.00');
      assert.equal(variantItem.pricing.maxPrice, '390.00');
      assert.equal(variantItem.pricing.discountPercent, 10);
      assert.equal(variantItem.pricing.gstInclusive, false);
    });

    it('supports market-aware subcategory filtering, search (name & SKU), featured, inStock, onSale, and price range', async () => {
      const subRes = await request(app).get(`/api/v1/products?category=${subSapphire.slug}`);
      assert.equal(subRes.status, 200);
      assert.equal(subRes.body.data.items.length, 1);
      assert.equal(subRes.body.data.items[0].id, activeVariantProduct.id);

      const skuRes = await request(app).get(`/api/v1/products?q=${sku('PUKH-5R')}`);
      assert.equal(skuRes.status, 200);
      assert.equal(skuRes.body.data.items.length, 1);
      assert.equal(skuRes.body.data.items[0].id, activeVariantProduct.id);

      const hiddenSkuRes = await request(app).get(`/api/v1/products?q=${sku('PUKH-HIDDEN')}`);
      assert.equal(hiddenSkuRes.status, 200);
      assert.equal(hiddenSkuRes.body.data.items.length, 0);

      // onSale in IN: only activeVariantProduct has salePrice in IN
      const onSaleInRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&country=IN&onSale=true`
      );
      assert.equal(onSaleInRes.status, 200);
      assert.deepEqual(
        onSaleInRes.body.data.items.map((p) => p.id),
        [activeVariantProduct.id]
      );

      // onSale in US: both activeSimpleProduct ($24 sale) and activeVariantProduct ($252 sale) are on sale in US
      const onSaleUsRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&country=US&onSale=true`
      );
      assert.equal(onSaleUsRes.status, 200);
      assert.equal(onSaleUsRes.body.data.items.length, 2);

      // inStock filter excludes out-of-stock product in IN
      const inStockRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&inStock=true`
      );
      assert.equal(inStockRes.status, 200);
      assert.equal(inStockRes.body.data.items.length, 2);
      assert.equal(inStockRes.body.data.items.some((p) => p.id === outOfStockProduct.id), false);

      // Effective INR price range filter (18000 falls inside 15000..20000)
      const inrPriceRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&country=IN&minPrice=15000&maxPrice=20000`
      );
      assert.equal(inrPriceRes.status, 200);
      assert.equal(inrPriceRes.body.data.items.length, 1);
      assert.equal(inrPriceRes.body.data.items[0].id, activeVariantProduct.id);

      // Effective USD price range filter (24 USD falls inside 20..50 USD)
      const usdPriceRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&country=US&minPrice=20&maxPrice=50`
      );
      assert.equal(usdPriceRes.status, 200);
      assert.equal(usdPriceRes.body.data.items.length, 1);
      assert.equal(usdPriceRes.body.data.items[0].id, activeSimpleProduct.id);
    });

    it('supports sorting (price_asc, price_desc, name_asc) and pagination per market', async () => {
      const ascInRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&country=IN&sort=price_asc`
      );
      assert.equal(ascInRes.status, 200);
      assert.deepEqual(
        ascInRes.body.data.items.map((p) => p.id),
        [activeSimpleProduct.id, activeVariantProduct.id, outOfStockProduct.id]
      );

      const descUsRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&country=US&sort=price_desc`
      );
      assert.equal(descUsRes.status, 200);
      assert.deepEqual(
        descUsRes.body.data.items.map((p) => p.id),
        [activeVariantProduct.id, activeSimpleProduct.id]
      );

      const page1 = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&sort=name_asc&page=1&limit=2`
      );
      const page2 = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&sort=name_asc&page=2&limit=2`
      );
      assert.equal(page1.body.data.pagination.totalItems, 3);
      assert.equal(page1.body.data.pagination.totalPages, 2);
      assert.equal(page1.body.data.items.length, 2);
      assert.equal(page2.body.data.items.length, 1);
      assert.notEqual(page1.body.data.items[0].id, page2.body.data.items[0].id);
    });

    it('validates query parameters and rejects unsupported country codes or invalid price ranges', async () => {
      const badCountry = await request(app).get('/api/v1/products?country=GB');
      assert.equal(badCountry.status, 400);
      assert.equal(badCountry.body.error.code, 'VALIDATION_ERROR');

      const badRange = await request(app).get('/api/v1/products?minPrice=5000&maxPrice=1000');
      assert.equal(badRange.status, 400);
      assert.equal(badRange.body.error.code, 'VALIDATION_ERROR');

      const badLimit = await request(app).get('/api/v1/products?limit=200');
      assert.equal(badLimit.status, 400);
    });
  });

  describe('GET /api/v1/products/:slug (Regional PDP)', () => {
    it('returns full customer-safe PDP data for IN (default) and US markets with shared inventory', async () => {
      const resIn = await request(app).get(`/api/v1/products/${activeVariantProduct.slug}`);
      assert.equal(resIn.status, 200);

      const pIn = resIn.body.data.product;
      assert.equal(pIn.id, activeVariantProduct.id);
      assert.equal(pIn.pricing.country, 'IN');
      assert.equal(pIn.pricing.currency, 'INR');
      assert.equal(pIn.pricing.price, '20000.00');
      assert.equal(pIn.pricing.salePrice, '18000.00');
      assert.deepEqual(pIn.tax, { gstInclusive: true, gstRate: '3.00', hsnCode: '7103' });

      assert.equal(pIn.variants.length, 2);
      const v1In = pIn.variants[0];
      const v2In = pIn.variants[1];
      assert.equal(v1In.country, 'IN');
      assert.equal(v1In.currency, 'INR');
      assert.equal(v1In.price, '20000.00');
      assert.equal(v1In.salePrice, '18000.00');
      assert.equal(v1In.isDefault, true);
      assert.equal(v1In.isLowStock, true);
      assert.equal(v1In.isPurchasable, true);
      assert.equal(v1In.lowStockThreshold, undefined);
      assert.equal(v1In.optionSignature, undefined);
      assert.equal(v1In.prices, undefined);

      assert.equal(v2In.stockQuantity, 0);
      assert.equal(v2In.isOutOfStock, true);
      assert.equal(v2In.isPurchasable, false);

      // US market PDP for same product
      const resUs = await request(app).get(`/api/v1/products/${activeVariantProduct.slug}?country=US`);
      assert.equal(resUs.status, 200);
      const pUs = resUs.body.data.product;
      assert.equal(pUs.pricing.country, 'US');
      assert.equal(pUs.pricing.currency, 'USD');
      assert.equal(pUs.pricing.price, '280.00');
      assert.equal(pUs.pricing.salePrice, '252.00');
      assert.equal(pUs.tax.gstInclusive, false);
      assert.equal(pUs.variants[0].currency, 'USD');
      assert.equal(pUs.variants[0].price, '280.00');
      assert.equal(pUs.variants[0].stockQuantity, 2); // Shared inventory across countries
    });

    it('returns 404 when requesting a product in US that only has IN pricing (no INR fallback)', async () => {
      const inRes = await request(app).get(`/api/v1/products/${outOfStockProduct.slug}?country=IN`);
      assert.equal(inRes.status, 200);
      assert.equal(inRes.body.data.product.pricing.currency, 'INR');

      const usRes = await request(app).get(`/api/v1/products/${outOfStockProduct.slug}?country=US`);
      assert.equal(usRes.status, 404);
      assert.equal(usRes.body.error.code, 'PRODUCT_NOT_FOUND');
    });

    it('returns 404 for draft, archived, inactive-category, zero-active-variant, or unknown slugs', async () => {
      assert.equal((await request(app).get(`/api/v1/products/${draftProduct.slug}`)).status, 404);
      assert.equal((await request(app).get(`/api/v1/products/${archivedProduct.slug}`)).status, 404);
      assert.equal((await request(app).get(`/api/v1/products/${inactiveCategoryProduct.slug}`)).status, 404);
      assert.equal((await request(app).get(`/api/v1/products/${noActiveVariantsProduct.slug}`)).status, 404);
      assert.equal((await request(app).get('/api/v1/products/does-not-exist-xyz')).status, 404);
    });
  });
});
