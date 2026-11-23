import { DataTypes } from 'sequelize';

export const PRODUCT_TYPES = Object.freeze({
  SIMPLE: 'simple',
  VARIANT: 'variant',
});

export const PRODUCT_STATUSES = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
});

export default function defineProductModel(sequelize) {
  return sequelize.define(
    'Product',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
        field: 'category_id',
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING(220),
        allowNull: false,
        unique: true,
      },
      productType: {
        type: DataTypes.ENUM(...Object.values(PRODUCT_TYPES)),
        allowNull: false,
        defaultValue: PRODUCT_TYPES.SIMPLE,
        field: 'product_type',
      },
      status: {
        type: DataTypes.ENUM(...Object.values(PRODUCT_STATUSES)),
        allowNull: false,
        defaultValue: PRODUCT_STATUSES.DRAFT,
      },
      shortDescription: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: 'short_description',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      },
      traditionalSignificance: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        field: 'traditional_significance',
      },
      wearingInstructions: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        field: 'wearing_instructions',
      },
      careInstructions: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        field: 'care_instructions',
      },
      specifications: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
      },
      variantOptions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        field: 'variant_options',
      },
      gstRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'gst_rate',
      },
      hsnCode: {
        type: DataTypes.STRING(16),
        allowNull: true,
        defaultValue: null,
        field: 'hsn_code',
      },
      certificateUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: 'certificate_url',
      },
      certificatePublicId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
        field: 'certificate_public_id',
      },
      certificateResourceType: {
        type: DataTypes.ENUM('image', 'raw'),
        allowNull: true,
        defaultValue: null,
        field: 'certificate_resource_type',
      },
      certificateLabel: {
        type: DataTypes.STRING(150),
        allowNull: true,
        defaultValue: null,
        field: 'certificate_label',
      },
      weightGrams: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        field: 'weight_grams',
      },
      lengthCm: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        defaultValue: null,
        field: 'length_cm',
      },
      widthCm: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        defaultValue: null,
        field: 'width_cm',
      },
      heightCm: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        defaultValue: null,
        field: 'height_cm',
      },
      shippingNotes: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
        field: 'shipping_notes',
      },
      isFeatured: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_featured',
      },
      seoTitle: {
        type: DataTypes.STRING(160),
        allowNull: true,
        defaultValue: null,
        field: 'seo_title',
      },
      seoDescription: {
        type: DataTypes.STRING(320),
        allowNull: true,
        defaultValue: null,
        field: 'seo_description',
      },
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: 'published_at',
      },
    },
    {
      tableName: 'products',
      timestamps: true,
      paranoid: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    }
  );
}
