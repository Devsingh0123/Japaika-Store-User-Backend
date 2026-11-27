'use strict';

const crypto = require('node:crypto');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'shipping_settings',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        country: {
          type: Sequelize.CHAR(2),
          allowNull: false,
        },
        currency: {
          type: Sequelize.CHAR(3),
          allowNull: false,
        },
        flat_charge: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        free_shipping_threshold: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: null,
        },
        estimated_days_min: {
          type: Sequelize.TINYINT.UNSIGNED,
          allowNull: true,
          defaultValue: null,
        },
        estimated_days_max: {
          type: Sequelize.TINYINT.UNSIGNED,
          allowNull: true,
          defaultValue: null,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
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
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('shipping_settings', ['country'], {
      unique: true,
      name: 'uq_shipping_settings_country',
    });

    const now = new Date();
    await queryInterface.bulkInsert('shipping_settings', [
      {
        id: crypto.randomUUID(),
        country: 'IN',
        currency: 'INR',
        flat_charge: '0.00',
        free_shipping_threshold: '0.00',
        estimated_days_min: 3,
        estimated_days_max: 7,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        country: 'US',
        currency: 'USD',
        flat_charge: '15.00',
        free_shipping_threshold: '150.00',
        estimated_days_min: 7,
        estimated_days_max: 14,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shipping_settings');
  },
};
