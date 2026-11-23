import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DataTypes, fn } from 'sequelize';
import { User, UserOtp, UserRefreshToken } from '../../models/index.js';

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
];

function createSpyQueryInterface() {
  const createdTables = new Map();
  const indexes = [];
  const droppedTables = [];

  return {
    createdTables,
    indexes,
    droppedTables,
    async createTable(tableName, columns, options) {
      createdTables.set(tableName, { columns, options });
    },
    async addIndex(tableName, fields, options) {
      indexes.push({ tableName, fields, options });
    },
    async dropTable(tableName) {
      droppedTables.push(tableName);
    },
  };
}

describe('Shared Sequelize migrations compatibility (all 9 tables)', () => {
  it('loads all 9 migrations in deterministic dependency order', () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.cjs'))
      .sort();

    assert.deepEqual(files, EXPECTED_MIGRATION_FILES);
  });

  it('creates all 9 tables matching docs/DATABASE_SCHEMA.md and drops them cleanly on down()', async () => {
    const qi = createSpyQueryInterface();
    const SequelizeStub = { ...DataTypes, fn };

    for (const file of EXPECTED_MIGRATION_FILES) {
      const migration = require(path.join(migrationsDir, file));
      assert.equal(typeof migration.up, 'function');
      assert.equal(typeof migration.down, 'function');
      await migration.up(qi, SequelizeStub);
    }

    assert.deepEqual([...qi.createdTables.keys()], [
      'users',
      'user_otps',
      'user_refresh_tokens',
      'admins',
      'admin_refresh_tokens',
      'categories',
      'products',
      'product_variants',
      'product_images',
    ]);

    // Verify InnoDB + utf8mb4 + CHAR(36) UUID v4 PK across all 5 tables
    for (const [tableName, { columns, options }] of qi.createdTables.entries()) {
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

    // Verify admins columns, enums & defaults
    const admins = qi.createdTables.get('admins').columns;
    assert.deepEqual(Object.keys(admins), [
      'id',
      'email',
      'password_hash',
      'full_name',
      'role',
      'status',
      'last_login_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    assert.equal(admins.password_hash.allowNull, false);
    assert.equal(admins.full_name.allowNull, false);
    assert.deepEqual(admins.role.type.values, [
      'super_admin',
      'catalog_manager',
      'operations_manager',
      'support_moderator',
    ]);
    assert.equal(admins.role.defaultValue, 'support_moderator');
    assert.deepEqual(admins.status.type.values, ['active', 'suspended']);
    assert.equal(admins.status.defaultValue, 'active');

    // Verify admin_refresh_tokens columns & foreign keys
    const adminTokens = qi.createdTables.get('admin_refresh_tokens').columns;
    assert.deepEqual(Object.keys(adminTokens), [
      'id',
      'admin_id',
      'token_hash',
      'family_id',
      'expires_at',
      'revoked_at',
      'replaced_by_token_id',
      'ip_address',
      'user_agent',
      'created_at',
    ]);
    assert.deepEqual(adminTokens.admin_id.references, { model: 'admins', key: 'id' });
    assert.equal(adminTokens.admin_id.onDelete, 'CASCADE');
    assert.deepEqual(adminTokens.replaced_by_token_id.references, {
      model: 'admin_refresh_tokens',
      key: 'id',
    });
    assert.equal(adminTokens.replaced_by_token_id.onDelete, 'SET NULL');

    // Verify categories columns, defaults, and self-referencing RESTRICT FK
    const categories = qi.createdTables.get('categories').columns;
    assert.deepEqual(Object.keys(categories), [
      'id',
      'parent_id',
      'name',
      'slug',
      'description',
      'image_url',
      'image_public_id',
      'is_active',
      'sort_order',
      'seo_title',
      'seo_description',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    assert.deepEqual(categories.parent_id.references, { model: 'categories', key: 'id' });
    assert.equal(categories.parent_id.onUpdate, 'CASCADE');
    assert.equal(categories.parent_id.onDelete, 'RESTRICT');
    assert.equal(categories.is_active.defaultValue, true);
    assert.equal(categories.sort_order.defaultValue, 0);

    // Verify products columns, enums, defaults, and category RESTRICT FK
    const products = qi.createdTables.get('products').columns;
    assert.deepEqual(Object.keys(products), [
      'id',
      'category_id',
      'name',
      'slug',
      'product_type',
      'status',
      'short_description',
      'description',
      'traditional_significance',
      'wearing_instructions',
      'care_instructions',
      'specifications',
      'variant_options',
      'gst_rate',
      'hsn_code',
      'certificate_url',
      'certificate_public_id',
      'certificate_resource_type',
      'certificate_label',
      'weight_grams',
      'length_cm',
      'width_cm',
      'height_cm',
      'shipping_notes',
      'is_featured',
      'seo_title',
      'seo_description',
      'published_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    assert.deepEqual(products.category_id.references, { model: 'categories', key: 'id' });
    assert.equal(products.category_id.onUpdate, 'CASCADE');
    assert.equal(products.category_id.onDelete, 'RESTRICT');
    assert.deepEqual(products.product_type.type.values, ['simple', 'variant']);
    assert.deepEqual(products.status.type.values, ['draft', 'active', 'archived']);
    assert.deepEqual(products.certificate_resource_type.type.values, ['image', 'raw']);

    // Verify product_variants columns, defaults, and product CASCADE FK
    const variants = qi.createdTables.get('product_variants').columns;
    assert.deepEqual(Object.keys(variants), [
      'id',
      'product_id',
      'sku',
      'title',
      'option_values',
      'option_signature',
      'price',
      'sale_price',
      'stock_quantity',
      'low_stock_threshold',
      'is_active',
      'is_default',
      'sort_order',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    assert.deepEqual(variants.product_id.references, { model: 'products', key: 'id' });
    assert.equal(variants.product_id.onDelete, 'CASCADE');
    assert.equal(variants.low_stock_threshold.defaultValue, 5);
    assert.equal(variants.is_active.defaultValue, true);

    // Verify product_images columns and product CASCADE FK
    const images = qi.createdTables.get('product_images').columns;
    assert.deepEqual(Object.keys(images), [
      'id',
      'product_id',
      'image_url',
      'image_public_id',
      'alt_text',
      'is_primary',
      'sort_order',
      'created_at',
    ]);
    assert.deepEqual(images.product_id.references, { model: 'products', key: 'id' });
    assert.equal(images.product_id.onDelete, 'CASCADE');

    // Verify all expected named indexes across all 9 tables
    const indexNames = qi.indexes.map((idx) => `${idx.tableName}:${idx.options.name}`);
    assert.deepEqual(indexNames, [
      'users:uq_users_email',
      'users:idx_users_status',
      'user_otps:idx_user_otps_email_created',
      'user_otps:idx_user_otps_expires_at',
      'user_refresh_tokens:uq_user_refresh_tokens_hash',
      'user_refresh_tokens:idx_user_refresh_tokens_user_id',
      'user_refresh_tokens:idx_user_refresh_tokens_family_id',
      'user_refresh_tokens:idx_user_refresh_tokens_expires_at',
      'admins:uq_admins_email',
      'admins:idx_admins_role',
      'admins:idx_admins_status',
      'admin_refresh_tokens:uq_admin_refresh_tokens_hash',
      'admin_refresh_tokens:idx_admin_refresh_tokens_admin_id',
      'admin_refresh_tokens:idx_admin_refresh_tokens_family_id',
      'admin_refresh_tokens:idx_admin_refresh_tokens_expires_at',
      'categories:uq_categories_slug',
      'categories:idx_categories_parent_id',
      'categories:idx_categories_is_active_sort',
      'products:uq_products_slug',
      'products:idx_products_category_id',
      'products:idx_products_status_created',
      'products:idx_products_is_featured',
      'product_variants:uq_product_variants_sku',
      'product_variants:uq_product_variants_option_sig',
      'product_variants:idx_product_variants_product_id',
      'product_variants:idx_product_variants_stock',
      'product_images:idx_product_images_product_sort',
    ]);

    // Verify user-backend Sequelize models align with migrated columns
    const modelTablePairs = [
      [User, 'users'],
      [UserOtp, 'user_otps'],
      [UserRefreshToken, 'user_refresh_tokens'],
    ];
    for (const [model, tableName] of modelTablePairs) {
      const migratedCols = new Set(Object.keys(qi.createdTables.get(tableName).columns));
      for (const attr of Object.values(model.rawAttributes)) {
        assert.ok(
          migratedCols.has(attr.field),
          `Model ${model.name} field "${attr.field}" missing from migration ${tableName}`
        );
      }
    }

    // Verify reverse down() order drops child tables before parent tables
    for (const file of [...EXPECTED_MIGRATION_FILES].reverse()) {
      const migration = require(path.join(migrationsDir, file));
      await migration.down(qi, SequelizeStub);
    }

    assert.deepEqual(qi.droppedTables, [
      'product_images',
      'product_variants',
      'products',
      'categories',
      'admin_refresh_tokens',
      'admins',
      'user_refresh_tokens',
      'user_otps',
      'users',
    ]);
  });
});
