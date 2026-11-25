'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_variants', 'prices', {
      type: Sequelize.JSON,
      allowNull: true,
    });

    await queryInterface.sequelize.query(
      "UPDATE product_variants SET prices = '{}' WHERE prices IS NULL"
    );

    await queryInterface.changeColumn('product_variants', 'prices', {
      type: Sequelize.JSON,
      allowNull: false,
    });

    await queryInterface.removeColumn('product_variants', 'price');
    await queryInterface.removeColumn('product_variants', 'sale_price');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_variants', 'price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    });

    await queryInterface.addColumn('product_variants', 'sale_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });

    await queryInterface.removeColumn('product_variants', 'prices');
  },
};
