import { DataTypes } from 'sequelize';

export default function definePostalCodeModel(sequelize) {
  return sequelize.define(
    'PostalCode',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      country: {
        type: DataTypes.CHAR(2),
        allowNull: false,
      },
      postalCode: {
        type: DataTypes.STRING(20),
        allowNull: false,
        field: 'postal_code',
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      district: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
      },
      state: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      stateCode: {
        type: DataTypes.STRING(10),
        allowNull: true,
        defaultValue: null,
        field: 'state_code',
      },
    },
    {
      tableName: 'postal_codes',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );
}
