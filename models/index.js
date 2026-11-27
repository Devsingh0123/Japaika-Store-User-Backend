import sequelize from '../config/database.js';
import defineUserModel from './user.model.js';
import defineUserOtpModel from './userOtp.model.js';
import defineUserRefreshTokenModel from './userRefreshToken.model.js';
import defineCategoryModel from './category.model.js';
import defineProductModel, { PRODUCT_TYPES, PRODUCT_STATUSES } from './product.model.js';
import defineProductVariantModel, {
  SUPPORTED_MARKETS,
  SUPPORTED_COUNTRIES,
  DEFAULT_COUNTRY,
} from './productVariant.model.js';
import defineProductMediaModel, { PRODUCT_MEDIA_TYPES } from './productMedia.model.js';
import defineBannerModel, { BANNER_PLACEMENTS } from './banner.model.js';
import defineUserAddressModel, {
  ADDRESS_LABELS,
  ADDRESS_COUNTRY_RULES,
} from './userAddress.model.js';
import definePostalCodeModel from './postalCode.model.js';
import defineCouponModel, {
  COUPON_VISIBILITIES,
  ALL_COUPON_VISIBILITIES,
} from './coupon.model.js';
import defineShippingSettingModel from './shippingSetting.model.js';
import defineOrderModel, {
  ORDER_STATUSES,
  ALL_ORDER_STATUSES,
  PAYMENT_METHODS,
  ALL_PAYMENT_METHODS,
  PAYMENT_STATUSES,
  ALL_PAYMENT_STATUSES,
  CANCELLED_BY_ACTORS,
  ALL_CANCELLED_BY_ACTORS,
} from './order.model.js';
import defineOrderItemModel from './orderItem.model.js';

const User = defineUserModel(sequelize);
const UserOtp = defineUserOtpModel(sequelize);
const UserRefreshToken = defineUserRefreshTokenModel(sequelize);
const Category = defineCategoryModel(sequelize);
const Product = defineProductModel(sequelize);
const ProductVariant = defineProductVariantModel(sequelize);
const ProductMedia = defineProductMediaModel(sequelize);
const Banner = defineBannerModel(sequelize);
const UserAddress = defineUserAddressModel(sequelize);
const PostalCode = definePostalCodeModel(sequelize);
const Coupon = defineCouponModel(sequelize);
const ShippingSetting = defineShippingSettingModel(sequelize);
const Order = defineOrderModel(sequelize);
const OrderItem = defineOrderItemModel(sequelize);

User.hasMany(UserRefreshToken, {
  foreignKey: 'user_id',
  as: 'refreshTokens',
});

UserRefreshToken.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
});

User.hasMany(UserAddress, {
  foreignKey: { name: 'userId', field: 'user_id' },
  as: 'addresses',
});

UserAddress.belongsTo(User, {
  foreignKey: { name: 'userId', field: 'user_id' },
  as: 'user',
});

User.hasMany(Order, {
  foreignKey: { name: 'userId', field: 'user_id' },
  as: 'orders',
});

Order.belongsTo(User, {
  foreignKey: { name: 'userId', field: 'user_id' },
  as: 'user',
});

Coupon.hasMany(Order, {
  foreignKey: { name: 'couponId', field: 'coupon_id' },
  as: 'orders',
});

Order.belongsTo(Coupon, {
  foreignKey: { name: 'couponId', field: 'coupon_id' },
  as: 'coupon',
});

Order.hasMany(OrderItem, {
  foreignKey: { name: 'orderId', field: 'order_id' },
  as: 'items',
});

OrderItem.belongsTo(Order, {
  foreignKey: { name: 'orderId', field: 'order_id' },
  as: 'order',
});

Product.hasMany(OrderItem, {
  foreignKey: { name: 'productId', field: 'product_id' },
  as: 'orderItems',
});

OrderItem.belongsTo(Product, {
  foreignKey: { name: 'productId', field: 'product_id' },
  as: 'product',
});

ProductVariant.hasMany(OrderItem, {
  foreignKey: { name: 'variantId', field: 'variant_id' },
  as: 'orderItems',
});

OrderItem.belongsTo(ProductVariant, {
  foreignKey: { name: 'variantId', field: 'variant_id' },
  as: 'variant',
});

Category.belongsTo(Category, {
  foreignKey: { name: 'parentId', field: 'parent_id' },
  as: 'parent',
});

Category.hasMany(Category, {
  foreignKey: { name: 'parentId', field: 'parent_id' },
  as: 'subcategories',
});

Category.hasMany(Product, {
  foreignKey: { name: 'categoryId', field: 'category_id' },
  as: 'products',
});

Product.belongsTo(Category, {
  foreignKey: { name: 'categoryId', field: 'category_id' },
  as: 'category',
});

Product.hasMany(ProductVariant, {
  foreignKey: { name: 'productId', field: 'product_id' },
  as: 'variants',
});

ProductVariant.belongsTo(Product, {
  foreignKey: { name: 'productId', field: 'product_id' },
  as: 'product',
});

Product.hasMany(ProductMedia, {
  foreignKey: { name: 'productId', field: 'product_id' },
  as: 'media',
});

ProductMedia.belongsTo(Product, {
  foreignKey: { name: 'productId', field: 'product_id' },
  as: 'product',
});

export {
  sequelize,
  User,
  UserOtp,
  UserRefreshToken,
  Category,
  Product,
  ProductVariant,
  ProductMedia,
  Banner,
  UserAddress,
  PostalCode,
  Coupon,
  ShippingSetting,
  Order,
  OrderItem,
  PRODUCT_TYPES,
  PRODUCT_STATUSES,
  PRODUCT_MEDIA_TYPES,
  BANNER_PLACEMENTS,
  SUPPORTED_MARKETS,
  SUPPORTED_COUNTRIES,
  DEFAULT_COUNTRY,
  ADDRESS_LABELS,
  ADDRESS_COUNTRY_RULES,
  COUPON_VISIBILITIES,
  ALL_COUPON_VISIBILITIES,
  ORDER_STATUSES,
  ALL_ORDER_STATUSES,
  PAYMENT_METHODS,
  ALL_PAYMENT_METHODS,
  PAYMENT_STATUSES,
  ALL_PAYMENT_STATUSES,
  CANCELLED_BY_ACTORS,
  ALL_CANCELLED_BY_ACTORS,
};

export default {
  sequelize,
  User,
  UserOtp,
  UserRefreshToken,
  Category,
  Product,
  ProductVariant,
  ProductMedia,
  Banner,
  UserAddress,
  PostalCode,
  Coupon,
  ShippingSetting,
  Order,
  OrderItem,
  PRODUCT_TYPES,
  PRODUCT_STATUSES,
  PRODUCT_MEDIA_TYPES,
  BANNER_PLACEMENTS,
  SUPPORTED_MARKETS,
  SUPPORTED_COUNTRIES,
  DEFAULT_COUNTRY,
  ADDRESS_LABELS,
  ADDRESS_COUNTRY_RULES,
  COUPON_VISIBILITIES,
  ALL_COUPON_VISIBILITIES,
  ORDER_STATUSES,
  ALL_ORDER_STATUSES,
  PAYMENT_METHODS,
  ALL_PAYMENT_METHODS,
  PAYMENT_STATUSES,
  ALL_PAYMENT_STATUSES,
  CANCELLED_BY_ACTORS,
  ALL_CANCELLED_BY_ACTORS,
};
