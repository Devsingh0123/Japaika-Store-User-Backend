'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'user_refresh_tokens',
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
        token_hash: {
          type: Sequelize.CHAR(64),
          allowNull: false,
          unique: true,
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
            model: 'user_refresh_tokens',
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

    await queryInterface.addIndex('user_refresh_tokens', ['user_id'], {
      name: 'idx_user_refresh_tokens_user_id',
    });

    await queryInterface.addIndex('user_refresh_tokens', ['family_id'], {
      name: 'idx_user_refresh_tokens_family_id',
    });

    await queryInterface.addIndex('user_refresh_tokens', ['expires_at'], {
      name: 'idx_user_refresh_tokens_expires_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_refresh_tokens');
  },
};
