import { DataTypes } from 'sequelize';

export const PRODUCT_MEDIA_TYPES = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
});

export default function defineProductMediaModel(sequelize) {
  return sequelize.define(
    'ProductMedia',
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
      mediaType: {
        type: DataTypes.ENUM(...Object.values(PRODUCT_MEDIA_TYPES)),
        allowNull: false,
        defaultValue: PRODUCT_MEDIA_TYPES.IMAGE,
        field: 'media_type',
      },
      mediaUrl: {
        type: DataTypes.STRING(500),
        allowNull: false,
        field: 'media_url',
      },
      mediaPublicId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'media_public_id',
      },
      thumbnailUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: 'thumbnail_url',
      },
      mimeType: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
        field: 'mime_type',
      },
      durationSeconds: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
        defaultValue: null,
        field: 'duration_seconds',
      },
      altText: {
        type: DataTypes.STRING(160),
        allowNull: true,
        defaultValue: null,
        field: 'alt_text',
      },
      isPrimary: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_primary',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    {
      tableName: 'product_media',
      timestamps: true,
      updatedAt: false,
      underscored: true,
      createdAt: 'created_at',
    }
  );
}
