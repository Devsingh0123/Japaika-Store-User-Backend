import { DataTypes } from 'sequelize';

export const SUPPORTED_MARKETS = Object.freeze({
  IN: Object.freeze({ country: 'IN', currency: 'INR' }),
  US: Object.freeze({ country: 'US', currency: 'USD' }),
});

export const SUPPORTED_COUNTRIES = Object.freeze(Object.keys(SUPPORTED_MARKETS));
export const DEFAULT_COUNTRY = 'IN';

export default function defineProductVariantModel(sequelize) {
  return sequelize.define(
    'ProductVariant',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'product_id',
      },
      sku: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      title: {
        type: DataTypes.STRING(160),
        allowNull: true,
        defaultValue: null,
      },
      optionValues: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        field: 'option_values',
      },
      optionSignature: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
        field: 'option_signature',
      },
      prices: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      stockQuantity: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        field: 'stock_quantity',
      },
      lowStockThreshold: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 5,
        field: 'low_stock_threshold',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_default',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    {
      tableName: 'product_variants',
      timestamps: true,
      paranoid: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    }
  );
}
