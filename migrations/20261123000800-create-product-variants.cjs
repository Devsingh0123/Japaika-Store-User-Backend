'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'product_variants',
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
        sku: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        title: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        option_values: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        option_signature: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        sale_price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
        },
        stock_quantity: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        low_stock_threshold: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 5,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        is_default: {
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

    await queryInterface.addIndex('product_variants', ['sku'], {
      unique: true,
      name: 'uq_product_variants_sku',
    });

    await queryInterface.addIndex('product_variants', ['product_id', 'option_signature'], {
      unique: true,
      name: 'uq_product_variants_option_sig',
    });

    await queryInterface.addIndex('product_variants', ['product_id'], {
      name: 'idx_product_variants_product_id',
    });

    await queryInterface.addIndex('product_variants', ['is_active', 'stock_quantity'], {
      name: 'idx_product_variants_stock',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_variants');
  },
};
