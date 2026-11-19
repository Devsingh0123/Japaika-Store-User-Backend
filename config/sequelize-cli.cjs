require('dotenv').config({ quiet: true });

const baseConfig = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  timezone: '+00:00',
  migrationStorageTableName: 'sequelize_meta',
  define: {
    underscored: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
};

module.exports = {
  development: {
    ...baseConfig,
    database: process.env.DB_NAME || 'japaika_ecommerce',
  },
  test: {
    ...baseConfig,
    database: process.env.TEST_DB_NAME || 'japaika_ecommerce_test',
  },
  production: {
    ...baseConfig,
    database: process.env.DB_NAME,
    logging: false,
  },
};
