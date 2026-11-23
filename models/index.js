import sequelize from '../config/database.js';
import defineUserModel from './user.model.js';
import defineUserOtpModel from './userOtp.model.js';
import defineUserRefreshTokenModel from './userRefreshToken.model.js';
import defineCategoryModel from './category.model.js';
import defineProductModel, { PRODUCT_TYPES, PRODUCT_STATUSES } from './product.model.js';
import defineProductVariantModel from './productVariant.model.js';
import defineProductMediaModel, { PRODUCT_MEDIA_TYPES } from './productMedia.model.js';

const User = defineUserModel(sequelize);
const UserOtp = defineUserOtpModel(sequelize);
const UserRefreshToken = defineUserRefreshTokenModel(sequelize);
const Category = defineCategoryModel(sequelize);
const Product = defineProductModel(sequelize);
const ProductVariant = defineProductVariantModel(sequelize);
const ProductMedia = defineProductMediaModel(sequelize);

User.hasMany(UserRefreshToken, {
  foreignKey: 'user_id',
  as: 'refreshTokens',
});

UserRefreshToken.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
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
  PRODUCT_TYPES,
  PRODUCT_STATUSES,
  PRODUCT_MEDIA_TYPES,
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
  PRODUCT_TYPES,
  PRODUCT_STATUSES,
  PRODUCT_MEDIA_TYPES,
};
