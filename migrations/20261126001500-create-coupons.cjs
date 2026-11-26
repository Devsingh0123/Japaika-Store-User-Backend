'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'coupons',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        code: {
          type: Sequelize.STRING(32),
          allowNull: false,
        },
        description: {
          type: Sequelize.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
        discount_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
        },
        min_cart_subtotal_inr: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        min_cart_subtotal_usd: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        max_discount_inr: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: null,
        },
        max_discount_usd: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: null,
        },
        max_redemptions: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          defaultValue: null,
        },
        redemption_count: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        visibility: {
          type: Sequelize.ENUM('public', 'hidden'),
          allowNull: false,
          defaultValue: 'public',
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
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
          defaultValue: null,
        },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('coupons', ['code'], {
      unique: true,
      name: 'uq_coupons_code',
    });

    await queryInterface.addIndex('coupons', ['is_active', 'visibility', 'expires_at'], {
      name: 'idx_coupons_active_visibility_expires',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('coupons');
  },
};
