'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'products',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        category_id: {
          type: Sequelize.CHAR(36),
          allowNull: true,
          defaultValue: null,
          references: {
            model: 'categories',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        name: {
          type: Sequelize.STRING(200),
          allowNull: false,
        },
        slug: {
          type: Sequelize.STRING(220),
          allowNull: false,
        },
        product_type: {
          type: Sequelize.ENUM('simple', 'variant'),
          allowNull: false,
          defaultValue: 'simple',
        },
        status: {
          type: Sequelize.ENUM('draft', 'active', 'archived'),
          allowNull: false,
          defaultValue: 'draft',
        },
        short_description: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        traditional_significance: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        wearing_instructions: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        care_instructions: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        specifications: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        variant_options: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        gst_rate: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        hsn_code: {
          type: Sequelize.STRING(16),
          allowNull: true,
        },
        certificate_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        certificate_public_id: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        certificate_resource_type: {
          type: Sequelize.ENUM('image', 'raw'),
          allowNull: true,
        },
        certificate_label: {
          type: Sequelize.STRING(150),
          allowNull: true,
        },
        weight_grams: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
        },
        length_cm: {
          type: Sequelize.DECIMAL(8, 2),
          allowNull: true,
        },
        width_cm: {
          type: Sequelize.DECIMAL(8, 2),
          allowNull: true,
        },
        height_cm: {
          type: Sequelize.DECIMAL(8, 2),
          allowNull: true,
        },
        shipping_notes: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        is_featured: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        seo_title: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        seo_description: {
          type: Sequelize.STRING(320),
          allowNull: true,
        },
        published_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('products', ['slug'], {
      unique: true,
      name: 'uq_products_slug',
    });

    await queryInterface.addIndex('products', ['category_id'], {
      name: 'idx_products_category_id',
    });

    await queryInterface.addIndex('products', ['status', 'created_at'], {
      name: 'idx_products_status_created',
    });

    await queryInterface.addIndex('products', ['is_featured'], {
      name: 'idx_products_is_featured',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('products');
  },
};
