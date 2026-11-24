import { Op } from 'sequelize';
import { Banner } from '../models/index.js';

function sanitizeCtaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Allow relative storefront paths (excluding protocol-relative "//") and http/https URLs
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

function serializeBanner(banner) {
  return {
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle ?? null,
    badgeText: banner.badgeText ?? null,
    imageUrl: banner.imageUrl,
    mobileImageUrl: banner.mobileImageUrl ?? null,
    altText: banner.altText ?? null,
    ctaLabel: banner.ctaLabel ?? null,
    ctaUrl: sanitizeCtaUrl(banner.ctaUrl),
    placement: banner.placement,
    sortOrder: banner.sortOrder,
  };
}

export async function listActiveBanners({ placement, limit = 10 } = {}) {
  const now = new Date();
  const where = {
    isActive: true,
    [Op.and]: [
      {
        [Op.or]: [{ startsAt: { [Op.is]: null } }, { startsAt: { [Op.lte]: now } }],
      },
      {
        [Op.or]: [{ endsAt: { [Op.is]: null } }, { endsAt: { [Op.gte]: now } }],
      },
    ],
  };

  if (placement) {
    where.placement = placement;
  }

  const banners = await Banner.findAll({
    where,
    attributes: [
      'id',
      'title',
      'subtitle',
      'badgeText',
      'imageUrl',
      'mobileImageUrl',
      'altText',
      'ctaLabel',
      'ctaUrl',
      'placement',
      'sortOrder',
    ],
    order: [
      ['sortOrder', 'ASC'],
      ['created_at', 'DESC'],
    ],
    limit,
  });

  return {
    items: banners.map(serializeBanner),
  };
}
