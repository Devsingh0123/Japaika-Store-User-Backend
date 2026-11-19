'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'user_otps',
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
        otp_hash: {
          type: Sequelize.CHAR(64),
          allowNull: false,
        },
        purpose: {
          type: Sequelize.ENUM('login'),
          allowNull: false,
          defaultValue: 'login',
        },
        attempts: {
          type: Sequelize.TINYINT.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        max_attempts: {
          type: Sequelize.TINYINT.UNSIGNED,
          allowNull: false,
          defaultValue: 5,
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        consumed_at: {
          type: Sequelize.DATE,
          allowNull: true,
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

    await queryInterface.addIndex('user_otps', ['email', 'created_at'], {
      name: 'idx_user_otps_email_created',
    });

    await queryInterface.addIndex('user_otps', ['expires_at'], {
      name: 'idx_user_otps_expires_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_otps');
  },
};
