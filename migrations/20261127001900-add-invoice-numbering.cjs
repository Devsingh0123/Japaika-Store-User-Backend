'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'invoice_sequences',
      {
        financial_year: {
          type: Sequelize.STRING(10),
          allowNull: false,
          primaryKey: true,
        },
        last_number: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      {
        engine: 'InnoDB',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
      }
    );

    await queryInterface.addColumn('orders', 'invoice_number', {
      type: Sequelize.STRING(32),
      allowNull: true,
      defaultValue: null,
      after: 'order_number',
    });

    await queryInterface.addColumn('orders', 'invoice_issued_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      after: 'invoice_number',
    });

    await queryInterface.addIndex('orders', ['invoice_number'], {
      unique: true,
      name: 'uq_orders_invoice_number',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('orders', 'uq_orders_invoice_number');
    await queryInterface.removeColumn('orders', 'invoice_issued_at');
    await queryInterface.removeColumn('orders', 'invoice_number');
    await queryInterface.dropTable('invoice_sequences');
  },
};
