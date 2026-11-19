import { DataTypes } from 'sequelize';

export default function defineUserRefreshTokenModel(sequelize) {
  return sequelize.define(
    'UserRefreshToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      tokenHash: {
        type: DataTypes.CHAR(64),
        allowNull: false,
        unique: true,
        field: 'token_hash',
      },
      familyId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'family_id',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'expires_at',
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'revoked_at',
      },
      replacedByTokenId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'replaced_by_token_id',
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
      tableName: 'user_refresh_tokens',
      timestamps: true,
      updatedAt: false,
      underscored: true,
      createdAt: 'created_at',
    }
  );
}
