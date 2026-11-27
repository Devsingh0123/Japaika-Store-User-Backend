import { DataTypes } from 'sequelize';

export default function defineShippingSettingModel(sequelize) {
  return sequelize.define(
    'ShippingSetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      country: {
        type: DataTypes.CHAR(2),
        allowNull: false,
        unique: true,
      },
      currency: {
        type: DataTypes.CHAR(3),
        allowNull: false,
      },
      flatCharge: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'flat_charge',
      },
      freeShippingThreshold: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        field: 'free_shipping_threshold',
      },
      estimatedDaysMin: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        field: 'estimated_days_min',
      },
      estimatedDaysMax: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        field: 'estimated_days_max',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
    },
    {
      tableName: 'shipping_settings',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );
}
