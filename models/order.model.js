import { DataTypes } from 'sequelize';

export const ORDER_STATUSES = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  PACKED: 'packed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

export const ALL_ORDER_STATUSES = Object.freeze(Object.values(ORDER_STATUSES));

export const PAYMENT_METHODS = Object.freeze({
  RAZORPAY: 'razorpay',
  COD: 'cod',
});

export const ALL_PAYMENT_METHODS = Object.freeze(Object.values(PAYMENT_METHODS));

export const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
});

export const ALL_PAYMENT_STATUSES = Object.freeze(Object.values(PAYMENT_STATUSES));

export const CANCELLED_BY_ACTORS = Object.freeze({
  CUSTOMER: 'customer',
  ADMIN: 'admin',
});

export const ALL_CANCELLED_BY_ACTORS = Object.freeze(Object.values(CANCELLED_BY_ACTORS));

export default function defineOrderModel(sequelize) {
  return sequelize.define(
    'Order',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      orderNumber: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        field: 'order_number',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      country: {
        type: DataTypes.CHAR(2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.CHAR(3),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(...ALL_ORDER_STATUSES),
        allowNull: false,
        defaultValue: ORDER_STATUSES.PENDING_PAYMENT,
      },
      paymentMethod: {
        type: DataTypes.ENUM(...ALL_PAYMENT_METHODS),
        allowNull: false,
        defaultValue: PAYMENT_METHODS.RAZORPAY,
        field: 'payment_method',
      },
      paymentStatus: {
        type: DataTypes.ENUM(...ALL_PAYMENT_STATUSES),
        allowNull: false,
        defaultValue: PAYMENT_STATUSES.PENDING,
        field: 'payment_status',
      },
      subtotalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'subtotal_amount',
      },
      discountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'discount_amount',
      },
      shippingAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'shipping_amount',
      },
      taxAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'tax_amount',
      },
      grandTotalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'grand_total_amount',
      },
      couponId: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
        field: 'coupon_id',
      },
      couponCode: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: null,
        field: 'coupon_code',
      },
      couponSnapshot: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        field: 'coupon_snapshot',
      },
      shippingAddress: {
        type: DataTypes.JSON,
        allowNull: false,
        field: 'shipping_address',
      },
      customerNotes: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: 'customer_notes',
      },
      razorpayOrderId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: null,
        unique: true,
        field: 'razorpay_order_id',
      },
      razorpayPaymentId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: null,
        field: 'razorpay_payment_id',
      },
      razorpaySignature: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
        field: 'razorpay_signature',
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: 'paid_at',
      },
      courierName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
        field: 'courier_name',
      },
      awbNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
        field: 'awb_number',
      },
      trackingUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        field: 'tracking_url',
      },
      shippedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: 'shipped_at',
      },
      deliveredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: 'delivered_at',
      },
      cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: 'cancelled_at',
      },
      cancelledBy: {
        type: DataTypes.ENUM(...ALL_CANCELLED_BY_ACTORS),
        allowNull: true,
        defaultValue: null,
        field: 'cancelled_by',
      },
      cancellationReason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
        field: 'cancellation_reason',
      },
      stockRestored: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'stock_restored',
      },
      refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        field: 'refund_amount',
      },
      razorpayRefundId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: null,
        field: 'razorpay_refund_id',
      },
      refundedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: 'refunded_at',
      },
    },
    {
      tableName: 'orders',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );
}
