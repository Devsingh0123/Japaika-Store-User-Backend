import { DataTypes } from 'sequelize';

export const COUPON_VISIBILITIES = Object.freeze({
  PUBLIC: 'public',
  HIDDEN: 'hidden',
});

export const ALL_COUPON_VISIBILITIES = Object.freeze(Object.values(COUPON_VISIBILITIES));

export default function defineCouponModel(sequelize) {
  return sequelize.define(
    'Coupon',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
      },
      discountPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        field: 'discount_percentage',
      },
      minCartSubtotalInr: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'min_cart_subtotal_inr',
      },
      minCartSubtotalUsd: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'min_cart_subtotal_usd',
      },
      maxDiscountInr: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        field: 'max_discount_inr',
      },
      maxDiscountUsd: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        field: 'max_discount_usd',
      },
      maxRedemptions: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        field: 'max_redemptions',
      },
      redemptionCount: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        field: 'redemption_count',
      },
      visibility: {
        type: DataTypes.ENUM(...ALL_COUPON_VISIBILITIES),
        allowNull: false,
        defaultValue: COUPON_VISIBILITIES.PUBLIC,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: 'expires_at',
      },
    },
    {
      tableName: 'coupons',
      timestamps: true,
      paranoid: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    }
  );
}
