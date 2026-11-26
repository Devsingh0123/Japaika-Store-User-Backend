import {
  sequelize,
  User,
  UserAddress,
  PostalCode,
  DEFAULT_COUNTRY,
  ADDRESS_COUNTRY_RULES,
} from '../models/index.js';
import { sanitizeUser } from './auth.service.js';
import { AppError } from '../utils/http.js';

export const MAX_ADDRESSES_PER_USER = 20;

export function normalizePhone(phone) {
  if (phone === null || phone === undefined) return null;
  const trimmed = String(phone).trim();
  if (!trimmed) return null;
  return trimmed;
}

export function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length > 20) return false;
  const digitsOnly = normalized.replace(/[\s\-()]/g, '');
  return /^\+?[1-9]\d{9,14}$/.test(digitsOnly);
}

function cleanOptionalText(val) {
  if (val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  return trimmed ? trimmed : null;
}

export function validatePostalForCountry(country, postalCode) {
  const code = String(country || DEFAULT_COUNTRY).trim().toUpperCase();
  const rule = ADDRESS_COUNTRY_RULES[code];
  if (!rule) {
    throw new AppError(400, 'VALIDATION_ERROR', `Unsupported country code: ${code}`, [
      { field: 'country', message: `Unsupported country code: ${code}` },
    ]);
  }

  const trimmedPostal = String(postalCode ?? '').trim();
  if (!rule.postalRegex.test(trimmedPostal)) {
    throw new AppError(400, 'VALIDATION_ERROR', rule.postalMessage, [
      { field: 'postalCode', message: rule.postalMessage },
    ]);
  }

  return {
    country: code,
    postalCode: trimmedPostal,
    lookupCode: rule.normalizeLookupCode(trimmedPostal),
  };
}

export function formatAddress(address) {
  if (!address) return null;
  return {
    id: address.id,
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? null,
    landmark: address.landmark ?? null,
    city: address.city,
    district: address.district ?? null,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: Boolean(address.isDefault),
    createdAt: address.created_at ?? address.createdAt ?? null,
    updatedAt: address.updated_at ?? address.updatedAt ?? null,
  };
}

export function toOrderAddressSnapshot(address) {
  if (!address) return null;
  return {
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? null,
    landmark: address.landmark ?? null,
    city: address.city,
    district: address.district ?? null,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

async function getActiveUserOrThrow(userId, transaction) {
  const user = await User.findByPk(userId, { transaction });
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
  return user;
}

async function resolveAddressLocation({ country, postalCode, city, district, state }) {
  const {
    country: normalizedCountry,
    postalCode: normalizedPostal,
    lookupCode,
  } = validatePostalForCountry(country, postalCode);

  let finalCity = cleanOptionalText(city);
  let finalDistrict = cleanOptionalText(district);
  let finalState = cleanOptionalText(state);

  if (!finalCity || !finalState || finalDistrict === null) {
    const postalRecord = await PostalCode.findOne({
      where: {
        country: normalizedCountry,
        postalCode: lookupCode,
      },
    });

    if (postalRecord) {
      if (!finalCity) finalCity = postalRecord.city;
      if (finalDistrict === null && district === undefined) {
        finalDistrict = postalRecord.district ?? null;
      }
      if (!finalState) finalState = postalRecord.state;
    }
  }

  const missingDetails = [];
  if (!finalCity) {
    missingDetails.push({
      field: 'city',
      message: 'City is required when postal code is not found in directory.',
    });
  }
  if (!finalState) {
    missingDetails.push({
      field: 'state',
      message: 'State is required when postal code is not found in directory.',
    });
  }

  if (missingDetails.length > 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'City and state are required when postal code is not in directory.',
      missingDetails
    );
  }

  return {
    country: normalizedCountry,
    postalCode: normalizedPostal,
    city: finalCity,
    district: finalDistrict,
    state: finalState,
  };
}

// --- Customer Profile Services ---

export async function getProfile(userId) {
  const user = await getActiveUserOrThrow(userId);
  const defaultAddress = await UserAddress.findOne({
    where: { userId, isDefault: true },
    order: [
      ['updated_at', 'DESC'],
      ['created_at', 'DESC'],
    ],
  });

  return {
    user: sanitizeUser(user),
    defaultAddress: formatAddress(defaultAddress),
  };
}

export async function updateProfile(userId, payload = {}) {
  const user = await getActiveUserOrThrow(userId);
  const updates = {};

  if (payload.fullName !== undefined) {
    updates.fullName = payload.fullName === null ? null : String(payload.fullName).trim();
  }

  if (payload.phone !== undefined) {
    updates.phone = normalizePhone(payload.phone);
  }

  await user.update(updates);

  return {
    user: sanitizeUser(user),
  };
}

// --- Self-Hosted MySQL Postal Code Auto-Fill Lookup ---

export async function lookupPostalCode({ country = DEFAULT_COUNTRY, postalCode }) {
  const { country: normalizedCountry, lookupCode } = validatePostalForCountry(country, postalCode);

  const record = await PostalCode.findOne({
    where: {
      country: normalizedCountry,
      postalCode: lookupCode,
    },
  });

  if (!record) {
    return {
      found: false,
      country: normalizedCountry,
      postalCode: lookupCode,
      city: null,
      district: null,
      state: null,
      stateCode: null,
    };
  }

  return {
    found: true,
    country: record.country,
    postalCode: record.postalCode,
    city: record.city,
    district: record.district ?? null,
    state: record.state,
    stateCode: record.stateCode ?? null,
  };
}

// --- Customer Address Book Services ---

export async function listAddresses(userId, { country } = {}) {
  await getActiveUserOrThrow(userId);

  const where = { userId };
  if (country) {
    where.country = String(country).trim().toUpperCase();
  }

  const rows = await UserAddress.findAll({
    where,
    order: [
      ['isDefault', 'DESC'],
      ['updated_at', 'DESC'],
      ['created_at', 'DESC'],
    ],
  });

  return {
    items: rows.map(formatAddress),
  };
}

export async function getAddressById(userId, addressId) {
  await getActiveUserOrThrow(userId);

  const address = await UserAddress.findOne({
    where: { id: addressId, userId },
  });

  if (!address) {
    throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  }

  return formatAddress(address);
}

export async function createAddress(userId, payload) {
  await getActiveUserOrThrow(userId);

  const location = await resolveAddressLocation({
    country: payload.country ?? DEFAULT_COUNTRY,
    postalCode: payload.postalCode,
    city: payload.city,
    district: payload.district,
    state: payload.state,
  });

  const created = await sequelize.transaction(async (transaction) => {
    const existingCount = await UserAddress.count({
      where: { userId },
      transaction,
    });

    if (existingCount >= MAX_ADDRESSES_PER_USER) {
      throw new AppError(
        400,
        'ADDRESS_LIMIT_REACHED',
        `You can save up to ${MAX_ADDRESSES_PER_USER} addresses.`
      );
    }

    const shouldBeDefault = existingCount === 0 ? true : Boolean(payload.isDefault);

    if (shouldBeDefault && existingCount > 0) {
      await UserAddress.update(
        { isDefault: false },
        { where: { userId, isDefault: true }, transaction }
      );
    }

    return UserAddress.create(
      {
        userId,
        label: payload.label || 'home',
        fullName: String(payload.fullName).trim(),
        phone: normalizePhone(payload.phone),
        addressLine1: String(payload.addressLine1).trim(),
        addressLine2: cleanOptionalText(payload.addressLine2),
        landmark: cleanOptionalText(payload.landmark),
        city: location.city,
        district: location.district,
        state: location.state,
        postalCode: location.postalCode,
        country: location.country,
        isDefault: shouldBeDefault,
      },
      { transaction }
    );
  });

  return formatAddress(created);
}

export async function updateAddress(userId, addressId, payload) {
  await getActiveUserOrThrow(userId);

  const existing = await UserAddress.findOne({
    where: { id: addressId, userId },
  });

  if (!existing) {
    throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  }

  const postalOrCountryChanged =
    (payload.country !== undefined && payload.country !== existing.country) ||
    (payload.postalCode !== undefined && payload.postalCode !== existing.postalCode);

  const location = await resolveAddressLocation({
    country: payload.country ?? existing.country,
    postalCode: payload.postalCode ?? existing.postalCode,
    city: payload.city !== undefined ? payload.city : postalOrCountryChanged ? undefined : existing.city,
    district:
      payload.district !== undefined
        ? payload.district
        : postalOrCountryChanged
          ? undefined
          : existing.district,
    state:
      payload.state !== undefined ? payload.state : postalOrCountryChanged ? undefined : existing.state,
  });

  const updated = await sequelize.transaction(async (transaction) => {
    const updates = {
      country: location.country,
      postalCode: location.postalCode,
      city: location.city,
      district: location.district,
      state: location.state,
    };

    if (payload.label !== undefined) updates.label = payload.label;
    if (payload.fullName !== undefined) updates.fullName = String(payload.fullName).trim();
    if (payload.phone !== undefined) updates.phone = normalizePhone(payload.phone);
    if (payload.addressLine1 !== undefined) updates.addressLine1 = String(payload.addressLine1).trim();
    if (payload.addressLine2 !== undefined) updates.addressLine2 = cleanOptionalText(payload.addressLine2);
    if (payload.landmark !== undefined) updates.landmark = cleanOptionalText(payload.landmark);

    if (payload.isDefault === true && !existing.isDefault) {
      await UserAddress.update(
        { isDefault: false },
        { where: { userId, isDefault: true }, transaction }
      );
      updates.isDefault = true;
    }

    await existing.update(updates, { transaction });
    return existing;
  });

  return formatAddress(updated);
}

export async function setDefaultAddress(userId, addressId) {
  await getActiveUserOrThrow(userId);

  const updated = await sequelize.transaction(async (transaction) => {
    const address = await UserAddress.findOne({
      where: { id: addressId, userId },
      transaction,
    });

    if (!address) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
    }

    if (!address.isDefault) {
      await UserAddress.update(
        { isDefault: false },
        { where: { userId, isDefault: true }, transaction }
      );
      await address.update({ isDefault: true }, { transaction });
    }

    return address;
  });

  return formatAddress(updated);
}

export async function deleteAddress(userId, addressId) {
  await getActiveUserOrThrow(userId);

  return sequelize.transaction(async (transaction) => {
    const address = await UserAddress.findOne({
      where: { id: addressId, userId },
      transaction,
    });

    if (!address) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
    }

    const wasDefault = Boolean(address.isDefault);
    if (wasDefault) {
      await address.update({ isDefault: false }, { transaction });
    }

    await address.destroy({ transaction });

    let newDefaultAddressId = null;
    if (wasDefault) {
      const replacement = await UserAddress.findOne({
        where: { userId },
        order: [
          ['updated_at', 'DESC'],
          ['created_at', 'DESC'],
        ],
        transaction,
      });

      if (replacement) {
        await replacement.update({ isDefault: true }, { transaction });
        newDefaultAddressId = replacement.id;
      }
    }

    return {
      id: addressId,
      deleted: true,
      newDefaultAddressId,
    };
  });
}
