import { DataTypes } from 'sequelize';

export default function defineCategoryModel(sequelize) {
  return sequelize.define(
    'Category',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      parentId: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
        field: 'parent_id',
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING(150),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      },
      imageUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: 'image_url',
      },
      imagePublicId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
        field: 'image_public_id',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
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
    },
    {
      tableName: 'categories',
      timestamps: true,
      paranoid: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    }
  );
}
