'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_images');
  },
};
