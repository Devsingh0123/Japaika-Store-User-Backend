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
];

function createSpyQueryInterface() {
  const activeTables = new Map();
  const indexes = [];
  const droppedTables = [];
  const queries = [];

  return {
    activeTables,
    indexes,
    droppedTables,
    queries,
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
    async dropTable(tableName) {
      activeTables.delete(tableName);
      droppedTables.push(tableName);
    },
  };
}

describe('Shared Sequelize migrations compatibility (all 14 migrations / 12 active tables)', () => {
  it('loads all 14 migrations in deterministic dependency order', () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.cjs'))
      .sort();

    assert.deepEqual(files, EXPECTED_MIGRATION_FILES);
  });

  it('migrates all 12 active tables (including user_addresses with district and postal_codes without localities) and rolls back cleanly', async () => {
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
    ]);

    // Verify InnoDB + utf8mb4 + CHAR(36) UUID v4 PK across all 12 active tables
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

    // Verify product_variants replaced price & sale_price with prices JSON NOT NULL
    const variants = qi.activeTables.get('product_variants').columns;
    assert.equal(variants.price, undefined);
    assert.equal(variants.sale_price, undefined);
    assert.ok(variants.prices);
    assert.equal(variants.prices.type.key, 'JSON');
    assert.equal(variants.prices.allowNull, false);

    // Verify user_addresses columns (including district), FK, and indexes
    const addresses = qi.activeTables.get('user_addresses').columns;
    assert.deepEqual(Object.keys(addresses), [
      'id',
      'user_id',
      'label',
      'full_name',
      'phone',
      'address_line1',
      'address_line2',
      'landmark',
      'city',
      'district',
      'state',
      'postal_code',
      'country',
      'is_default',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    assert.deepEqual(addresses.user_id.references, { model: 'users', key: 'id' });
    assert.equal(addresses.user_id.onUpdate, 'CASCADE');
    assert.equal(addresses.user_id.onDelete, 'CASCADE');
    assert.deepEqual(addresses.label.type.values, ['home', 'work', 'other']);
    assert.equal(addresses.country.defaultValue, 'IN');
    assert.equal(addresses.is_default.defaultValue, false);

    const addressIndexNames = qi.indexes
      .filter((idx) => idx.tableName === 'user_addresses')
      .map((idx) => idx.options.name);
    assert.deepEqual(addressIndexNames, [
      'idx_user_addresses_user_default',
      'idx_user_addresses_user_country',
    ]);

    // Verify postal_codes columns (city, district, state, state_code; NO localities) and indexes
    const postalCodes = qi.activeTables.get('postal_codes').columns;
    assert.deepEqual(Object.keys(postalCodes), [
      'id',
      'country',
      'postal_code',
      'city',
      'district',
      'state',
      'state_code',
      'created_at',
      'updated_at',
    ]);
    assert.equal(postalCodes.localities, undefined);

    const postalIndexNames = qi.indexes
      .filter((idx) => idx.tableName === 'postal_codes')
      .map((idx) => idx.options.name);
    assert.deepEqual(postalIndexNames, [
      'uq_postal_codes_country_code',
      'idx_postal_codes_country_state',
    ]);

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
