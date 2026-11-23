'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'admin_refresh_tokens',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        admin_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: {
            model: 'admins',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        token_hash: {
          type: Sequelize.CHAR(64),
          allowNull: false,
        },
        family_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        revoked_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        replaced_by_token_id: {
          type: Sequelize.CHAR(36),
          allowNull: true,
          references: {
            model: 'admin_refresh_tokens',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        ip_address: {
          type: Sequelize.STRING(45),
          allowNull: true,
        },
        user_agent: {
          type: Sequelize.STRING(255),
          allowNull: true,
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

    await queryInterface.addIndex('admin_refresh_tokens', ['token_hash'], {
      unique: true,
      name: 'uq_admin_refresh_tokens_hash',
    });

    await queryInterface.addIndex('admin_refresh_tokens', ['admin_id'], {
      name: 'idx_admin_refresh_tokens_admin_id',
    });

    await queryInterface.addIndex('admin_refresh_tokens', ['family_id'], {
      name: 'idx_admin_refresh_tokens_family_id',
    });

    await queryInterface.addIndex('admin_refresh_tokens', ['expires_at'], {
      name: 'idx_admin_refresh_tokens_expires_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_refresh_tokens');
  },
};
