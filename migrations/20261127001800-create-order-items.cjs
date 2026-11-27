'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'order_items',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        order_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: {
            model: 'orders',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        product_id: {
          type: Sequelize.CHAR(36),
          allowNull: true,
          defaultValue: null,
          references: {
            model: 'products',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        variant_id: {
          type: Sequelize.CHAR(36),
          allowNull: true,
          defaultValue: null,
          references: {
            model: 'product_variants',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        product_name: {
          type: Sequelize.STRING(200),
          allowNull: false,
        },
        product_slug: {
          type: Sequelize.STRING(220),
          allowNull: false,
        },
        variant_title: {
          type: Sequelize.STRING(160),
          allowNull: true,
          defaultValue: null,
        },
        sku: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        option_values: {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: null,
        },
        image_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
        },
        hsn_code: {
          type: Sequelize.STRING(16),
          allowNull: true,
          defaultValue: null,
        },
        gst_rate: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        quantity: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
        },
        unit_price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
        },
        unit_sale_price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: null,
        },
        unit_effective_price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
        },
        line_total: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
        },
        tax_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
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

    await queryInterface.addIndex('order_items', ['order_id'], {
      name: 'idx_order_items_order_id',
    });

    await queryInterface.addIndex('order_items', ['variant_id'], {
      name: 'idx_order_items_variant_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_items');
  },
};
