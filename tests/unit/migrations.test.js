import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DataTypes, fn } from 'sequelize';
import {
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
} from '../../models/index.js';

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(currentDir, '../../migrations');

const EXPECTED_MIGRATION_FILES = [
  '20261119000100-create-users.cjs',
  '20261119000200-create-user-otps.cjs',
  '20261119000300-create-user-refresh-tokens.cjs',
  '20261119000400-create-admins.cjs',
  '20261119000500-create-admin-refresh-tokens.cjs',
  '20261119000600-create-categories.cjs',
  '20261123000700-create-products.cjs',
  '20261123000800-create-product-variants.cjs',
  '20261123000900-create-product-images.cjs',
  '20261123001000-migrate-product-images-to-product-media.cjs',
  '20261124001100-create-banners.cjs',
  '20261125001200-replace-variant-price-columns-with-prices-json.cjs',
  '20261126001300-create-user-addresses.cjs',
  '20261126001400-create-postal-codes.cjs',
  '20261126001500-create-coupons.cjs',
  '20261127001600-create-shipping-settings.cjs',
  '20261127001700-create-orders.cjs',
  '20261127001800-create-order-items.cjs',
];

function createSpyQueryInterface() {
  const activeTables = new Map();
  const indexes = [];
  const droppedTables = [];
  const queries = [];
  const bulkInserts = [];

  return {
    activeTables,
    indexes,
    droppedTables,
    queries,
    bulkInserts,
    sequelize: {
      async query(sql) {
        queries.push(sql);
      },
    },
    async createTable(tableName, columns, options) {
      activeTables.set(tableName, { columns: { ...columns }, options });
    },
    async addColumn(tableName, columnName, attribute) {
      const table = activeTables.get(tableName);
      assert.ok(table, `Cannot addColumn ${columnName} to missing table ${tableName}`);
      table.columns[columnName] = attribute;
    },
    async changeColumn(tableName, columnName, attribute) {
      const table = activeTables.get(tableName);
      assert.ok(table, `Cannot changeColumn ${columnName} on missing table ${tableName}`);
      table.columns[columnName] = attribute;
    },
    async removeColumn(tableName, columnName) {
      const table = activeTables.get(tableName);
      assert.ok(table, `Cannot removeColumn ${columnName} from missing table ${tableName}`);
      delete table.columns[columnName];
    },
    async addIndex(tableName, fields, options) {
      indexes.push({ tableName, fields, options });
    },
    async bulkInsert(tableName, records) {
      bulkInserts.push({ tableName, records });
    },
    async dropTable(tableName) {
      activeTables.delete(tableName);
      droppedTables.push(tableName);
    },
  };
}

describe('Shared Sequelize migrations compatibility (all 18 migrations / 16 active tables)', () => {
  it('loads all 18 migrations in deterministic dependency order', () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.cjs'))
      .sort();

    assert.deepEqual(files, EXPECTED_MIGRATION_FILES);
  });

  it('migrates all 16 active tables (including shipping_settings, orders, and order_items) and rolls back cleanly', async () => {
    const qi = createSpyQueryInterface();
    const SequelizeStub = { ...DataTypes, fn };

    for (const file of EXPECTED_MIGRATION_FILES) {
      const migration = require(path.join(migrationsDir, file));
      assert.equal(typeof migration.up, 'function');
      assert.equal(typeof migration.down, 'function');
      await migration.up(qi, SequelizeStub);
    }

    assert.deepEqual([...qi.activeTables.keys()], [
      'users',
      'user_otps',
      'user_refresh_tokens',
      'admins',
      'admin_refresh_tokens',
      'categories',
      'products',
      'product_variants',
      'product_media',
      'banners',
      'user_addresses',
      'postal_codes',
      'coupons',
      'shipping_settings',
      'orders',
      'order_items',
    ]);

    // Verify InnoDB + utf8mb4 + CHAR(36) UUID v4 PK across all 16 active tables
    for (const [tableName, { columns, options }] of qi.activeTables.entries()) {
      assert.equal(options.engine, 'InnoDB', `${tableName} must use InnoDB`);
      assert.equal(options.charset, 'utf8mb4', `${tableName} must use utf8mb4`);
      assert.equal(
        options.collate,
        'utf8mb4_unicode_ci',
        `${tableName} must use utf8mb4_unicode_ci`
      );
      assert.equal(columns.id.primaryKey, true, `${tableName}.id must be primaryKey`);
      assert.equal(columns.id.allowNull, false, `${tableName}.id must be NOT NULL`);
      assert.equal(columns.id.type.key, 'CHAR', `${tableName}.id must be CHAR(36)`);
      assert.equal(columns.id.type._length, 36, `${tableName}.id length must be 36`);
    }

    // Verify shipping_settings default seeded rows for IN (INR) and US (USD)
    assert.equal(qi.bulkInserts.length, 1);
    assert.equal(qi.bulkInserts[0].tableName, 'shipping_settings');
    assert.deepEqual(
      qi.bulkInserts[0].records.map((r) => ({ country: r.country, currency: r.currency })),
      [
        { country: 'IN', currency: 'INR' },
        { country: 'US', currency: 'USD' },
      ]
    );

    // Verify orders columns (no payment_expires_at, ON DELETE RESTRICT on user_id)
    const orders = qi.activeTables.get('orders').columns;
    assert.equal(orders.payment_expires_at, undefined);
    assert.deepEqual(orders.user_id.references, { model: 'users', key: 'id' });
    assert.equal(orders.user_id.onDelete, 'RESTRICT');
    assert.deepEqual(orders.cancelled_by.type.values, ['customer', 'admin']);

    // Verify order_items FK to orders uses RESTRICT (orders & items are permanently preserved)
    const orderItems = qi.activeTables.get('order_items').columns;
    assert.deepEqual(orderItems.order_id.references, { model: 'orders', key: 'id' });
    assert.equal(orderItems.order_id.onDelete, 'RESTRICT');

    // Verify user-backend Sequelize models align with migrated columns
    const modelTablePairs = [
      [User, 'users'],
      [UserOtp, 'user_otps'],
      [UserRefreshToken, 'user_refresh_tokens'],
      [Category, 'categories'],
      [Product, 'products'],
      [ProductVariant, 'product_variants'],
      [ProductMedia, 'product_media'],
      [Banner, 'banners'],
      [UserAddress, 'user_addresses'],
      [PostalCode, 'postal_codes'],
      [Coupon, 'coupons'],
      [ShippingSetting, 'shipping_settings'],
      [Order, 'orders'],
      [OrderItem, 'order_items'],
    ];
    for (const [model, tableName] of modelTablePairs) {
      const migratedCols = new Set(Object.keys(qi.activeTables.get(tableName).columns));
      for (const attr of Object.values(model.rawAttributes)) {
        assert.ok(
          migratedCols.has(attr.field),
          `Model ${model.name} field "${attr.field}" missing from migration ${tableName}`
        );
      }
    }

    // Verify reverse down() order restores columns/tables and drops all tables cleanly
    for (const file of [...EXPECTED_MIGRATION_FILES].reverse()) {
      const migration = require(path.join(migrationsDir, file));
      await migration.down(qi, SequelizeStub);
    }

    assert.equal(qi.activeTables.size, 0);
  });
});
