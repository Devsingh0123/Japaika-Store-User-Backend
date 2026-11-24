import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../app.js';
import { sequelize, Banner } from '../../models/index.js';

describe('Customer Homepage Banner API integration tests (/api/v1/banners)', () => {
  const runTag = crypto.randomBytes(4).toString('hex');
  const title = (label) => `BannerTest-${runTag}-${label}`;
  const createdBannerIds = [];

  let heroPrimary;
  let heroScheduledActive;
  let heroUnsafeUrl;
  let promoActive;
  let heroFuture;
  let heroExpired;
  let heroInactive;
  let heroSoftDeleted;

  before(async () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
    const oneHourAhead = new Date(now + 60 * 60 * 1000);
    const twoHoursAhead = new Date(now + 2 * 60 * 60 * 1000);

    // 1. Active hero banner (no schedule, lowest sortOrder so it appears first)
    heroPrimary = await Banner.create({
      title: title('Hero Primary'),
      subtitle: 'Lab-verified Vedic gemstones with transparent certification.',
      badgeText: 'Lab Certified',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/hero-1.webp',
      imagePublicId: 'japaika-ecom/banners/hero-1',
      mobileImageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/hero-1-mobile.webp',
      mobileImagePublicId: 'japaika-ecom/banners/hero-1-mobile',
      altText: 'Certified gemstones banner',
      ctaLabel: 'Explore Gemstones',
      ctaUrl: '/categories/gemstones',
      placement: 'homepage_hero',
      sortOrder: -50,
      isActive: true,
    });
    createdBannerIds.push(heroPrimary.id);

    // 2. Active scheduled hero banner (within active start/end window)
    heroScheduledActive = await Banner.create({
      title: title('Hero Scheduled Active'),
      subtitle: 'Festive Rudraksha collection.',
      badgeText: 'Festive',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/hero-2.webp',
      imagePublicId: 'japaika-ecom/banners/hero-2',
      altText: 'Rudraksha festive banner',
      ctaLabel: 'Shop Rudraksha',
      ctaUrl: 'https://japaika.example.com/rudraksha',
      placement: 'homepage_hero',
      sortOrder: -40,
      isActive: true,
      startsAt: oneHourAgo,
      endsAt: oneHourAhead,
    });
    createdBannerIds.push(heroScheduledActive.id);

    // 3. Active hero banner with unsafe CTA URL (defense-in-depth neutralization)
    heroUnsafeUrl = await Banner.create({
      title: title('Hero Unsafe CTA'),
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/hero-3.webp',
      ctaLabel: 'Click',
      ctaUrl: 'javascript:alert(1)',
      placement: 'homepage_hero',
      sortOrder: -30,
      isActive: true,
    });
    createdBannerIds.push(heroUnsafeUrl.id);

    // 4. Active homepage_promo banner
    promoActive = await Banner.create({
      title: title('Promo Strip'),
      subtitle: 'Complimentary lab certificate with every natural gemstone.',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/promo-1.webp',
      imagePublicId: 'japaika-ecom/banners/promo-1',
      ctaLabel: 'Learn More',
      ctaUrl: '/authenticity',
      placement: 'homepage_promo',
      sortOrder: -45,
      isActive: true,
      startsAt: oneHourAgo,
      endsAt: null,
    });
    createdBannerIds.push(promoActive.id);

    // 5. Future scheduled banner (must be hidden)
    heroFuture = await Banner.create({
      title: title('Hero Future'),
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/future.webp',
      placement: 'homepage_hero',
      sortOrder: -60,
      isActive: true,
      startsAt: oneHourAhead,
      endsAt: twoHoursAhead,
    });
    createdBannerIds.push(heroFuture.id);

    // 6. Expired scheduled banner (must be hidden)
    heroExpired = await Banner.create({
      title: title('Hero Expired'),
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/expired.webp',
      placement: 'homepage_hero',
      sortOrder: -60,
      isActive: true,
      startsAt: twoHoursAgo,
      endsAt: oneHourAgo,
    });
    createdBannerIds.push(heroExpired.id);

    // 7. Inactive banner (must be hidden)
    heroInactive = await Banner.create({
      title: title('Hero Inactive'),
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/inactive.webp',
      placement: 'homepage_hero',
      sortOrder: -60,
      isActive: false,
    });
    createdBannerIds.push(heroInactive.id);

    // 8. Soft-deleted banner (must be hidden)
    heroSoftDeleted = await Banner.create({
      title: title('Hero Deleted'),
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/deleted.webp',
      placement: 'homepage_hero',
      sortOrder: -60,
      isActive: true,
    });
    createdBannerIds.push(heroSoftDeleted.id);
    await heroSoftDeleted.destroy();
  });

  after(async () => {
    if (createdBannerIds.length > 0) {
      await Banner.destroy({
        where: { id: createdBannerIds },
        force: true,
      });
    }
    await sequelize.close();
  });

  it('returns only active, in-schedule, non-deleted banners ordered by sortOrder ASC', async () => {
    const res = await request(app).get('/api/v1/banners?limit=20');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(Array.isArray(res.body.data.items), true);

    const testItems = res.body.data.items.filter((item) => item.title.includes(runTag));
    assert.deepEqual(
      testItems.map((item) => item.id),
      [heroPrimary.id, promoActive.id, heroScheduledActive.id, heroUnsafeUrl.id]
    );

    // Verify hidden banners never appear
    const returnedIds = new Set(res.body.data.items.map((item) => item.id));
    assert.equal(returnedIds.has(heroFuture.id), false);
    assert.equal(returnedIds.has(heroExpired.id), false);
    assert.equal(returnedIds.has(heroInactive.id), false);
    assert.equal(returnedIds.has(heroSoftDeleted.id), false);
  });

  it('strips internal Cloudinary and admin fields and neutralizes unsafe CTA URLs', async () => {
    const res = await request(app).get('/api/v1/banners?placement=homepage_hero&limit=20');

    assert.equal(res.status, 200);
    const testItems = res.body.data.items.filter((item) => item.title.includes(runTag));
    assert.equal(testItems.length, 3);

    const primary = testItems[0];
    assert.deepEqual(primary, {
      id: heroPrimary.id,
      title: heroPrimary.title,
      subtitle: 'Lab-verified Vedic gemstones with transparent certification.',
      badgeText: 'Lab Certified',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/hero-1.webp',
      mobileImageUrl: 'https://res.cloudinary.com/demo/image/upload/japaika-ecom/banners/hero-1-mobile.webp',
      altText: 'Certified gemstones banner',
      ctaLabel: 'Explore Gemstones',
      ctaUrl: '/categories/gemstones',
      placement: 'homepage_hero',
      sortOrder: -50,
    });

    assert.equal(primary.imagePublicId, undefined);
    assert.equal(primary.mobileImagePublicId, undefined);
    assert.equal(primary.isActive, undefined);
    assert.equal(primary.startsAt, undefined);
    assert.equal(primary.endsAt, undefined);
    assert.equal(primary.deletedAt, undefined);

    const scheduled = testItems[1];
    assert.equal(scheduled.ctaUrl, 'https://japaika.example.com/rudraksha');

    const unsafe = testItems[2];
    assert.equal(unsafe.ctaUrl, null);
  });

  it('filters banners by placement and respects limit', async () => {
    const promoRes = await request(app).get('/api/v1/banners?placement=homepage_promo&limit=20');
    assert.equal(promoRes.status, 200);
    const promoItems = promoRes.body.data.items.filter((item) => item.title.includes(runTag));
    assert.deepEqual(
      promoItems.map((item) => item.id),
      [promoActive.id]
    );

    const limitedRes = await request(app).get('/api/v1/banners?placement=homepage_hero&limit=1');
    assert.equal(limitedRes.status, 200);
    assert.equal(limitedRes.body.data.items.length, 1);
    assert.equal(limitedRes.body.data.items[0].id, heroPrimary.id);
  });

  it('returns 400 VALIDATION_ERROR for invalid placement or out-of-range limit', async () => {
    const badPlacement = await request(app).get('/api/v1/banners?placement=sidebar');
    assert.equal(badPlacement.status, 400);
    assert.equal(badPlacement.body.success, false);
    assert.equal(badPlacement.body.error.code, 'VALIDATION_ERROR');

    const zeroLimit = await request(app).get('/api/v1/banners?limit=0');
    assert.equal(zeroLimit.status, 400);
    assert.equal(zeroLimit.body.error.code, 'VALIDATION_ERROR');

    const hugeLimit = await request(app).get('/api/v1/banners?limit=50');
    assert.equal(hugeLimit.status, 400);
    assert.equal(hugeLimit.body.error.code, 'VALIDATION_ERROR');
  });
});
