import sequelize from '../config/database.js';
import defineUserModel from './user.model.js';
import defineUserOtpModel from './userOtp.model.js';
import defineUserRefreshTokenModel from './userRefreshToken.model.js';

const User = defineUserModel(sequelize);
const UserOtp = defineUserOtpModel(sequelize);
const UserRefreshToken = defineUserRefreshTokenModel(sequelize);

User.hasMany(UserRefreshToken, {
  foreignKey: 'user_id',
  as: 'refreshTokens',
});

UserRefreshToken.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
});

export { sequelize, User, UserOtp, UserRefreshToken };
export default { sequelize, User, UserOtp, UserRefreshToken };
