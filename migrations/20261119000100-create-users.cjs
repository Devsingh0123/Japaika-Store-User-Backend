'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'users',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        email: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        full_name: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        phone: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        is_email_verified: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        status: {
          type: Sequelize.ENUM('active', 'suspended'),
          allowNull: false,
          defaultValue: 'active',
        },
        last_login_at: {
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

    await queryInterface.addIndex('users', ['email'], {
      unique: true,
      name: 'uq_users_email',
    });

    await queryInterface.addIndex('users', ['status'], {
      name: 'idx_users_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
