import { DataTypes } from 'sequelize';

export const ADDRESS_LABELS = Object.freeze(['home', 'work', 'other']);

export const ADDRESS_COUNTRY_RULES = Object.freeze({
  IN: Object.freeze({
    country: 'IN',
    postalRegex: /^[1-9][0-9]{5}$/,
    postalMessage: 'Indian PIN code must be a valid 6-digit number (e.g., 560038).',
    normalizeLookupCode: (code) => String(code).trim(),
  }),
  US: Object.freeze({
    country: 'US',
    postalRegex: /^\d{5}(?:-\d{4})?$/,
    postalMessage: 'US ZIP code must be 5 digits or ZIP+4 (e.g., 10001 or 94107-1234).',
    normalizeLookupCode: (code) => String(code).trim().slice(0, 5),
  }),
});

export default function defineUserAddressModel(sequelize) {
  return sequelize.define(
    'UserAddress',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      label: {
        type: DataTypes.ENUM(...ADDRESS_LABELS),
        allowNull: false,
        defaultValue: 'home',
      },
      fullName: {
        type: DataTypes.STRING(120),
        allowNull: false,
        field: 'full_name',
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      addressLine1: {
        type: DataTypes.STRING(200),
        allowNull: false,
        field: 'address_line1',
      },
      addressLine2: {
        type: DataTypes.STRING(200),
        allowNull: true,
        defaultValue: null,
        field: 'address_line2',
      },
      landmark: {
        type: DataTypes.STRING(160),
        allowNull: true,
        defaultValue: null,
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      district: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
      },
      state: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      postalCode: {
        type: DataTypes.STRING(20),
        allowNull: false,
        field: 'postal_code',
      },
      country: {
        type: DataTypes.CHAR(2),
        allowNull: false,
        defaultValue: 'IN',
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_default',
      },
    },
    {
      tableName: 'user_addresses',
      timestamps: true,
      paranoid: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    }
  );
}
