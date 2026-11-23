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

describe('Customer Catalog API integration tests (/api/v1/categories & /api/v1/products)', () => {
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
    // Categories: 2 active roots (1 with active + inactive sub, 1 empty), 1 inactive root with active sub
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

    // 1. Active Variant Product (in subcategory, featured, on sale, has image + short video + certificate + OOS variant + inactive variant)
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
      variantOptions: [
        { name: 'Weight', values: ['5 Ratti', '7 Ratti'] },
      ],
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
        price: 20000.0,
        salePrice: 18000.0,
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
        price: 28000.0,
        salePrice: null,
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
        price: 35000.0,
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

    // 2. Active Simple Product (directly in root category, lower price, in stock)
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
      price: 1500.0,
      salePrice: null,
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

    // 3. Active Out-of-Stock Simple Product
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
      price: 45000.0,
      salePrice: null,
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
      price: 999.0,
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
      price: 999.0,
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
      price: 1200.0,
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
      price: 1000.0,
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
    // Delete subcategories before root categories (ON DELETE RESTRICT)
    for (const id of [...createdCategoryIds].reverse()) {
      await Category.destroy({ where: { id }, force: true });
    }
    await sequelize.close();
  });

  describe('GET /api/v1/categories & GET /api/v1/categories/:slug', () => {
    it('returns active categories with nested active subcategories, product counts, SEO, and no internal fields', async () => {
      const res = await request(app).get('/api/v1/categories');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const items = res.body.data.items;
      const gem = items.find((c) => c.id === rootGemstones.id);
      const empty = items.find((c) => c.id === rootEmpty.id);
      const inactive = items.find((c) => c.id === rootInactive.id);

      assert.ok(gem);
      assert.ok(empty);
      assert.equal(inactive, undefined);
      assert.equal(gem.imagePublicId, undefined);
      assert.equal(gem.productCount, 3); // 2 direct active + 1 in active subcategory
      assert.deepEqual(gem.seo, {
        title: 'Buy Natural Gemstones',
        description: 'Lab certified Vedic gemstones',
      });
      assert.equal(gem.subcategories.length, 1);
      assert.equal(gem.subcategories[0].id, subSapphire.id);
      assert.equal(gem.subcategories[0].productCount, 1);
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

      const subRes = await request(app).get(`/api/v1/categories/${subSapphire.slug}`);
      assert.equal(subRes.status, 200);
      assert.equal(subRes.body.data.category.parent.id, rootGemstones.id);
      assert.equal(subRes.body.data.category.parent.slug, rootGemstones.slug);

      // Inactive category, inactive subcategory, and active subcategory under inactive parent all 404
      assert.equal((await request(app).get(`/api/v1/categories/${rootInactive.slug}`)).status, 404);
      assert.equal((await request(app).get(`/api/v1/categories/${subInactive.slug}`)).status, 404);
      assert.equal((await request(app).get(`/api/v1/categories/${subUnderInactiveRoot.slug}`)).status, 404);
      assert.equal((await request(app).get('/api/v1/categories/bad_slug!')).status, 400);
    });
  });

  describe('GET /api/v1/products', () => {
    it('exposes only published active products in active categories with active variants', async () => {
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
      assert.equal(variantItem.availability.variantCount, 2); // excludes inactive 3rd variant
    });

    it('supports subcategory filtering, search (name & SKU), featured, inStock, onSale, and price range', async () => {
      // Subcategory slug returns only its product
      const subRes = await request(app).get(`/api/v1/products?category=${subSapphire.slug}`);
      assert.equal(subRes.status, 200);
      assert.equal(subRes.body.data.items.length, 1);
      assert.equal(subRes.body.data.items[0].id, activeVariantProduct.id);

      // Search via `q` alias by SKU (matches active variant SKU, ignores inactive/draft SKU)
      const skuRes = await request(app).get(`/api/v1/products?q=${sku('PUKH-5R')}`);
      assert.equal(skuRes.status, 200);
      assert.equal(skuRes.body.data.items.length, 1);
      assert.equal(skuRes.body.data.items[0].id, activeVariantProduct.id);

      const hiddenSkuRes = await request(app).get(`/api/v1/products?q=${sku('PUKH-HIDDEN')}`);
      assert.equal(hiddenSkuRes.status, 200);
      assert.equal(hiddenSkuRes.body.data.items.length, 0);

      // Featured & onSale filters
      const featuredRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&featured=true&onSale=true`
      );
      assert.equal(featuredRes.status, 200);
      assert.equal(featuredRes.body.data.items.length, 1);
      assert.equal(featuredRes.body.data.items[0].id, activeVariantProduct.id);

      // inStock filter excludes out-of-stock product
      const inStockRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&inStock=true`
      );
      assert.equal(inStockRes.status, 200);
      assert.equal(inStockRes.body.data.items.length, 2);
      assert.equal(inStockRes.body.data.items.some((p) => p.id === outOfStockProduct.id), false);

      // Effective price range filter (18000 sale price falls inside 15000..20000)
      const priceRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&minPrice=15000&maxPrice=20000`
      );
      assert.equal(priceRes.status, 200);
      assert.equal(priceRes.body.data.items.length, 1);
      assert.equal(priceRes.body.data.items[0].id, activeVariantProduct.id);
    });

    it('supports sorting (price_asc, price_desc, name_asc) and pagination', async () => {
      const ascRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&sort=price_asc`
      );
      assert.equal(ascRes.status, 200);
      assert.deepEqual(
        ascRes.body.data.items.map((p) => p.id),
        [activeSimpleProduct.id, activeVariantProduct.id, outOfStockProduct.id]
      );

      const descRes = await request(app).get(
        `/api/v1/products?category=${rootGemstones.slug}&sort=price_desc`
      );
      assert.equal(descRes.status, 200);
      assert.deepEqual(
        descRes.body.data.items.map((p) => p.id),
        [outOfStockProduct.id, activeVariantProduct.id, activeSimpleProduct.id]
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

    it('validates query parameters and rejects invalid price ranges', async () => {
      const badRange = await request(app).get('/api/v1/products?minPrice=5000&maxPrice=1000');
      assert.equal(badRange.status, 400);
      assert.equal(badRange.body.error.code, 'VALIDATION_ERROR');

      const badLimit = await request(app).get('/api/v1/products?limit=200');
      assert.equal(badLimit.status, 400);
    });
  });

  describe('GET /api/v1/products/:slug', () => {
    it('returns full customer-safe PDP data with variants, unified image+video media, certificate, specs, shipping, and SEO', async () => {
      const res = await request(app).get(`/api/v1/products/${activeVariantProduct.slug}`);
      assert.equal(res.status, 200);

      const p = res.body.data.product;
      assert.equal(p.id, activeVariantProduct.id);
      assert.equal(p.category.slug, subSapphire.slug);
      assert.equal(p.category.parent.slug, rootGemstones.slug);

      // Unified media (image + short video, no mediaPublicId)
      assert.equal(p.media.length, 2);
      assert.equal(p.media[0].mediaType, 'image');
      assert.equal(p.media[0].isPrimary, true);
      assert.equal(p.media[0].mediaPublicId, undefined);
      assert.equal(p.media[1].mediaType, 'video');
      assert.equal(p.media[1].durationSeconds, 12.5);
      assert.ok(p.media[1].thumbnailUrl);

      // Separate certificate (no certificatePublicId)
      assert.deepEqual(p.certificate, {
        url: 'https://res.cloudinary.com/demo/raw/upload/japaika-ecom/certificates/pukhraj.pdf',
        resourceType: 'raw',
        label: 'IGI Lab Certified',
      });
      assert.equal(p.certificatePublicId, undefined);

      // Parsed JSON specifications & variantOptions
      assert.equal(Array.isArray(p.specifications), true);
      assert.equal(p.specifications[0].key, 'Origin');
      assert.equal(Array.isArray(p.variantOptions), true);
      assert.equal(p.variantOptions[0].name, 'Weight');

      // Tax, shipping, SEO
      assert.deepEqual(p.tax, { gstInclusive: true, gstRate: '3.00', hsnCode: '7103' });
      assert.equal(p.shipping.weightGrams, 50);
      assert.equal(p.shipping.lengthCm, 10.5);
      assert.deepEqual(p.seo, {
        title: 'Ceylon Yellow Sapphire Pukhraj',
        description: 'Certified unheated yellow sapphire',
      });

      // Active variants only (hides inactive 3rd variant; keeps out-of-stock 2nd variant visible & unpurchasable)
      assert.equal(p.variants.length, 2);
      const v1 = p.variants[0];
      const v2 = p.variants[1];
      assert.equal(v1.isDefault, true);
      assert.equal(v1.isLowStock, true);
      assert.equal(v1.isPurchasable, true);
      assert.equal(v1.lowStockThreshold, undefined);
      assert.equal(v1.optionSignature, undefined);

      assert.equal(v2.stockQuantity, 0);
      assert.equal(v2.isOutOfStock, true);
      assert.equal(v2.isPurchasable, false);
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
