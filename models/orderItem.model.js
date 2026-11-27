import { DataTypes } from 'sequelize';

export default function defineOrderItemModel(sequelize) {
  return sequelize.define(
    'OrderItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      orderId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'order_id',
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
        field: 'product_id',
      },
      variantId: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
        field: 'variant_id',
      },
      productName: {
        type: DataTypes.STRING(200),
        allowNull: false,
        field: 'product_name',
      },
      productSlug: {
        type: DataTypes.STRING(220),
        allowNull: false,
        field: 'product_slug',
      },
      variantTitle: {
        type: DataTypes.STRING(160),
        allowNull: true,
        defaultValue: null,
        field: 'variant_title',
      },
      sku: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      optionValues: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        field: 'option_values',
      },
      imageUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: 'image_url',
      },
      hsnCode: {
        type: DataTypes.STRING(16),
        allowNull: true,
        defaultValue: null,
        field: 'hsn_code',
      },
      gstRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'gst_rate',
      },
      quantity: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'unit_price',
      },
      unitSalePrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        field: 'unit_sale_price',
      },
      unitEffectivePrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'unit_effective_price',
      },
      lineTotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'line_total',
      },
      taxAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'tax_amount',
      },
    },
    {
      tableName: 'order_items',
      timestamps: true,
      updatedAt: false,
      underscored: true,
      createdAt: 'created_at',
    }
  );
}
