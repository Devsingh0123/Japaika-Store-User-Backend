'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'product_media',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        product_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: {
            model: 'products',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        media_type: {
          type: Sequelize.ENUM('image', 'video'),
          allowNull: false,
          defaultValue: 'image',
        },
        media_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        media_public_id: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        thumbnail_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        mime_type: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        duration_seconds: {
          type: Sequelize.DECIMAL(6, 2),
          allowNull: true,
        },
        alt_text: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        is_primary: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
        },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('product_media', ['product_id', 'sort_order'], {
      name: 'idx_product_media_product_sort',
    });

    await queryInterface.addIndex('product_media', ['product_id', 'media_type'], {
      name: 'idx_product_media_product_type',
    });

    await queryInterface.sequelize.query(`
      INSERT INTO product_media (
        id,
        product_id,
        media_type,
        media_url,
        media_public_id,
        alt_text,
        is_primary,
        sort_order,
        created_at
      )
      SELECT
        id,
        product_id,
        'image',
        image_url,
        image_public_id,
        alt_text,
        is_primary,
        sort_order,
        created_at
      FROM product_images
    `);

    await queryInterface.dropTable('product_images');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'product_images',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        product_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: {
            model: 'products',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        image_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        image_public_id: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        alt_text: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        is_primary: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
        },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('product_images', ['product_id', 'sort_order'], {
      name: 'idx_product_images_product_sort',
    });

    await queryInterface.sequelize.query(`
      INSERT INTO product_images (
        id,
        product_id,
        image_url,
        image_public_id,
        alt_text,
        is_primary,
        sort_order,
        created_at
      )
      SELECT
        id,
        product_id,
        media_url,
        media_public_id,
        alt_text,
        is_primary,
        sort_order,
        created_at
      FROM product_media
      WHERE media_type = 'image'
    `);

    await queryInterface.dropTable('product_media');
  },
};
