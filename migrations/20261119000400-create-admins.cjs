'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'admins',
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
        password_hash: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        full_name: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        role: {
          type: Sequelize.ENUM(
            'super_admin',
            'catalog_manager',
            'operations_manager',
            'support_moderator'
          ),
          allowNull: false,
          defaultValue: 'support_moderator',
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

    await queryInterface.addIndex('admins', ['email'], {
      unique: true,
      name: 'uq_admins_email',
    });

    await queryInterface.addIndex('admins', ['role'], {
      name: 'idx_admins_role',
    });

    await queryInterface.addIndex('admins', ['status'], {
      name: 'idx_admins_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admins');
  },
};
