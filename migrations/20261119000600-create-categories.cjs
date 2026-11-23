'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'categories',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        parent_id: {
          type: Sequelize.CHAR(36),
          allowNull: true,
          defaultValue: null,
          references: {
            model: 'categories',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        name: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        slug: {
          type: Sequelize.STRING(150),
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        image_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        image_public_id: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        seo_title: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        seo_description: {
          type: Sequelize.STRING(320),
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

    await queryInterface.addIndex('categories', ['slug'], {
      unique: true,
      name: 'uq_categories_slug',
    });

    await queryInterface.addIndex('categories', ['parent_id'], {
      name: 'idx_categories_parent_id',
    });

    await queryInterface.addIndex('categories', ['is_active', 'sort_order'], {
      name: 'idx_categories_is_active_sort',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('categories');
  },
};
