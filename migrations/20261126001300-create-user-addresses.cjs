'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'user_addresses',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: {
            model: 'users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        label: {
          type: Sequelize.ENUM('home', 'work', 'other'),
          allowNull: false,
          defaultValue: 'home',
        },
        full_name: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        phone: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        address_line1: {
          type: Sequelize.STRING(200),
          allowNull: false,
        },
        address_line2: {
          type: Sequelize.STRING(200),
          allowNull: true,
          defaultValue: null,
        },
        landmark: {
          type: Sequelize.STRING(160),
          allowNull: true,
          defaultValue: null,
        },
        city: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        district: {
          type: Sequelize.STRING(100),
          allowNull: true,
          defaultValue: null,
        },
        state: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        postal_code: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        country: {
          type: Sequelize.CHAR(2),
          allowNull: false,
          defaultValue: 'IN',
        },
        is_default: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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

    await queryInterface.addIndex('user_addresses', ['user_id', 'is_default'], {
      name: 'idx_user_addresses_user_default',
    });

    await queryInterface.addIndex('user_addresses', ['user_id', 'country'], {
      name: 'idx_user_addresses_user_country',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_addresses');
  },
};
