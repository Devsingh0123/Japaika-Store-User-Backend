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
      activeTables.set(tableName, { columns, options });
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

describe('Shared Sequelize migrations compatibility (all 10 migrations / 9 active tables)', () => {
  it('loads all 10 migrations in deterministic dependency order', () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.cjs'))
      .sort();

    assert.deepEqual(files, EXPECTED_MIGRATION_FILES);
  });

  it('migrates all 9 active tables (with product_media replacing product_images) and rolls back cleanly', async () => {
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
    ]);

    // Verify InnoDB + utf8mb4 + CHAR(36) UUID v4 PK across all 9 active tables
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

    // Verify data-copy query migrated product_images -> product_media safely
    assert.equal(qi.queries.length, 1);
    assert.match(qi.queries[0], /INSERT INTO product_media/i);
    assert.match(qi.queries[0], /FROM product_images/i);

    // Verify product_media columns, enum, defaults, and CASCADE FK
    const media = qi.activeTables.get('product_media').columns;
    assert.deepEqual(Object.keys(media), [
      'id',
      'product_id',
      'media_type',
      'media_url',
      'media_public_id',
      'thumbnail_url',
      'mime_type',
      'duration_seconds',
      'alt_text',
      'is_primary',
      'sort_order',
      'created_at',
    ]);
    assert.deepEqual(media.product_id.references, { model: 'products', key: 'id' });
    assert.equal(media.product_id.onUpdate, 'CASCADE');
    assert.equal(media.product_id.onDelete, 'CASCADE');
    assert.deepEqual(media.media_type.type.values, ['image', 'video']);
    assert.equal(media.media_type.defaultValue, 'image');
    assert.equal(media.is_primary.defaultValue, false);
    assert.equal(media.sort_order.defaultValue, 0);

    // Verify certificates remain separate on products
    const products = qi.activeTables.get('products').columns;
    assert.ok(products.certificate_url);
    assert.ok(products.certificate_public_id);
    assert.ok(products.certificate_resource_type);
    assert.ok(products.certificate_label);

    // Verify product_media indexes were created
    const mediaIndexNames = qi.indexes
      .filter((idx) => idx.tableName === 'product_media')
      .map((idx) => idx.options.name);
    assert.deepEqual(mediaIndexNames, [
      'idx_product_media_product_sort',
      'idx_product_media_product_type',
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

    // Verify reverse down() order restores product_images, copies image rows back, and drops all tables cleanly
    for (const file of [...EXPECTED_MIGRATION_FILES].reverse()) {
      const migration = require(path.join(migrationsDir, file));
      await migration.down(qi, SequelizeStub);
    }

    assert.equal(qi.activeTables.size, 0);
    assert.equal(qi.queries.length, 2);
    assert.match(qi.queries[1], /INSERT INTO product_images/i);
    assert.match(qi.queries[1], /WHERE media_type = 'image'/i);
  });
});
