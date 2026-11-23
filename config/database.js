import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

dotenv.config({ quiet: true });

const sequelize = new Sequelize(
  process.env.DB_NAME || 'japaika_ecommerce',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    timezone: '+00:00',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      underscored: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  }
);

export default sequelize;
