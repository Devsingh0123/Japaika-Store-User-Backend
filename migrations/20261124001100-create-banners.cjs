'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'banners',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        title: {
          type: Sequelize.STRING(160),
          allowNull: false,
        },
        subtitle: {
          type: Sequelize.STRING(320),
          allowNull: true,
          defaultValue: null,
        },
        badge_text: {
          type: Sequelize.STRING(60),
          allowNull: true,
          defaultValue: null,
        },
        image_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        image_public_id: {
          type: Sequelize.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
        mobile_image_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
        },
        mobile_image_public_id: {
          type: Sequelize.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
        alt_text: {
          type: Sequelize.STRING(160),
          allowNull: true,
          defaultValue: null,
        },
        cta_label: {
          type: Sequelize.STRING(60),
          allowNull: true,
          defaultValue: null,
        },
        cta_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
        },
        placement: {
          type: Sequelize.ENUM('homepage_hero', 'homepage_promo'),
          allowNull: false,
          defaultValue: 'homepage_hero',
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        starts_at: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        ends_at: {
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

    await queryInterface.addIndex('banners', ['placement', 'is_active', 'sort_order'], {
      name: 'idx_banners_placement_active_sort',
    });

    await queryInterface.addIndex('banners', ['starts_at', 'ends_at'], {
      name: 'idx_banners_schedule',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('banners');
  },
};
