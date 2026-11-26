'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'postal_codes',
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
        postal_code: {
          type: Sequelize.STRING(20),
          allowNull: false,
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
        state_code: {
          type: Sequelize.STRING(10),
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
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('postal_codes', ['country', 'postal_code'], {
      unique: true,
      name: 'uq_postal_codes_country_code',
    });

    await queryInterface.addIndex('postal_codes', ['country', 'state'], {
      name: 'idx_postal_codes_country_state',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('postal_codes');
  },
};
