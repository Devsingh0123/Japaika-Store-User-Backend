'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'orders',
      {
        id: {
          type: Sequelize.CHAR(36),
          primaryKey: true,
          allowNull: false,
        },
        order_number: {
          type: Sequelize.STRING(32),
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
          onDelete: 'RESTRICT',
        },
        country: {
          type: Sequelize.CHAR(2),
          allowNull: false,
        },
        currency: {
          type: Sequelize.CHAR(3),
          allowNull: false,
        },
        status: {
          type: Sequelize.ENUM(
            'pending_payment',
            'confirmed',
            'processing',
            'packed',
            'shipped',
            'delivered',
            'cancelled'
          ),
          allowNull: false,
          defaultValue: 'pending_payment',
        },
        payment_method: {
          type: Sequelize.ENUM('razorpay', 'cod'),
          allowNull: false,
          defaultValue: 'razorpay',
        },
        payment_status: {
          type: Sequelize.ENUM('pending', 'paid', 'failed', 'refund_pending', 'refunded'),
          allowNull: false,
          defaultValue: 'pending',
        },
        subtotal_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
        },
        discount_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        shipping_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        tax_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
        },
        grand_total_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
        },
        coupon_id: {
          type: Sequelize.CHAR(36),
          allowNull: true,
          defaultValue: null,
          references: {
            model: 'coupons',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        coupon_code: {
          type: Sequelize.STRING(32),
          allowNull: true,
          defaultValue: null,
        },
        coupon_snapshot: {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: null,
        },
        shipping_address: {
          type: Sequelize.JSON,
          allowNull: false,
        },
        customer_notes: {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
        },
        razorpay_order_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          defaultValue: null,
        },
        razorpay_payment_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          defaultValue: null,
        },
        razorpay_signature: {
          type: Sequelize.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
        paid_at: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        courier_name: {
          type: Sequelize.STRING(100),
          allowNull: true,
          defaultValue: null,
        },
        awb_number: {
          type: Sequelize.STRING(100),
          allowNull: true,
          defaultValue: null,
        },
        tracking_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
        },
        shipped_at: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        delivered_at: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        cancelled_at: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        cancelled_by: {
          type: Sequelize.ENUM('customer', 'admin'),
          allowNull: true,
          defaultValue: null,
        },
        cancellation_reason: {
          type: Sequelize.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
        stock_restored: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        refund_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: null,
        },
        razorpay_refund_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          defaultValue: null,
        },
        refunded_at: {
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
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('orders', ['order_number'], {
      unique: true,
      name: 'uq_orders_order_number',
    });

    await queryInterface.addIndex('orders', ['razorpay_order_id'], {
      unique: true,
      name: 'uq_orders_razorpay_order_id',
    });

    await queryInterface.addIndex('orders', ['user_id', 'created_at'], {
      name: 'idx_orders_user_created',
    });

    await queryInterface.addIndex('orders', ['status', 'created_at'], {
      name: 'idx_orders_status_created',
    });

    await queryInterface.addIndex('orders', ['payment_status'], {
      name: 'idx_orders_payment_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('orders');
  },
};
