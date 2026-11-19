import { DataTypes } from 'sequelize';

export default function defineUserOtpModel(sequelize) {
  return sequelize.define(
    'UserOtp',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      otpHash: {
        type: DataTypes.CHAR(64),
        allowNull: false,
        field: 'otp_hash',
      },
      purpose: {
        type: DataTypes.ENUM('login'),
        allowNull: false,
        defaultValue: 'login',
      },
      attempts: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      maxAttempts: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 5,
        field: 'max_attempts',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'expires_at',
      },
      consumedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'consumed_at',
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'ip_address',
      },
      userAgent: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'user_agent',
      },
    },
    {
      tableName: 'user_otps',
      timestamps: true,
      updatedAt: false,
      underscored: true,
      createdAt: 'created_at',
    }
  );
}
