# Japaika User Backend (`user-backend/`)

Customer-facing REST API for the standalone Japaika E-commerce platform, built with **Node.js (ES Modules)**, **Express 5**, **MySQL**, and **Sequelize ORM**.

`user-backend/` is also the **designated owner of all shared MySQL migrations** (`migrations/`) via `sequelize-cli`.

---

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create `.env` (using `.env.example` as a reference) with your local MySQL credentials (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`), 3 customer auth secrets (`USER_JWT_ACCESS_SECRET`, `USER_JWT_REFRESH_SECRET`, `OTP_HMAC_SECRET`), and Razorpay credentials (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, optional `RAZORPAY_WEBHOOK_SECRET`):
   - Leave `SMTP_HOST` unset locally to log OTP codes directly to the server console.
   - Set `SMTP_HOST` (plus `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`) for staging/production (`SMTP_HOST` is mandatory in `NODE_ENV=production`).
   - Razorpay integration uses the official `razorpay` Node.js SDK (`INR` & `USD`, no fake payment fallback).

3. **Create the MySQL database and run migrations**:
   ```bash
   npm run migrate
   ```
   Included shared migrations:
   - `20261119000100-create-users.cjs` (`users`)
   - `20261119000200-create-user-otps.cjs` (`user_otps`)
   - `20261119000300-create-user-refresh-tokens.cjs` (`user_refresh_tokens`)
   - `20261119000400-create-admins.cjs` (`admins`)
   - `20261119000500-create-admin-refresh-tokens.cjs` (`admin_refresh_tokens`)
   - `20261119000600-create-categories.cjs` (`categories`)
   - `20261123000700-create-products.cjs` (`products`)
   - `20261123000800-create-product-variants.cjs` (`product_variants`)
   - `20261123000900-create-product-images.cjs` (`product_images` — superseded by `product_media`)
   - `20261123001000-migrate-product-images-to-product-media.cjs` (`product_media` — unified images & short videos)
   - `20261124001100-create-banners.cjs` (`banners` — dynamic homepage hero & promo banners)
   - `20261125001200-replace-variant-price-columns-with-prices-json.cjs` (`product_variants.prices` — regional `IN`/`INR` & `US`/`USD` JSON pricing)
   - `20261126001300-create-user-addresses.cjs` (`user_addresses` — customer shipping address book with `city`, `district`, `state`)
   - `20261126001400-create-postal-codes.cjs` (`postal_codes` — self-hosted MySQL postal directory for `city`, `district`, `state` auto-fill)
   - `20261126001500-create-coupons.cjs` (`coupons` — regional `INR`/`USD` percentage discount coupons with `public`/`hidden` visibility)
   - `20261127001600-create-shipping-settings.cjs` (`shipping_settings` — admin-controlled `IN`/`INR` & `US`/`USD` shipping charges)
   - `20261127001700-create-orders.cjs` (`orders` — immutable order snapshots, Razorpay payment/refund references & tracking)
   - `20261127001800-create-order-items.cjs` (`order_items` — immutable line-item snapshots)
   - `20261127001900-add-invoice-numbering.cjs` (`invoice_sequences` + `orders.invoice_number` / `invoice_issued_at` — independent FY sequential invoice numbering)

   To import verified postal code datasets (`.json`, `.csv`, or `.tsv`) into `postal_codes`:
   ```bash
   node utils/importPostalCodes.js <path-to-dataset> [--country=IN]
   ```

   Other migration commands:
   - `npm run migrate:status` — Inspect applied/pending migrations
   - `npm run migrate:undo` — Roll back the most recent migration

   > **Important:** Never run `sequelize.sync({ force: true })` or `sequelize.sync({ alter: true })` against shared databases. Always use versioned `sequelize-cli` migrations.

4. **Start the server**:
   ```bash
   npm run dev   # Development (nodemon)
   npm start     # Production (node)
   ```

---

## Automated Tests

Run all unit and integration tests (uses unique synthetic test emails with automatic per-test cleanup and mocked email delivery):

```bash
npm test
```

---

## Implemented Endpoints (`/api/v1`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Service & MySQL connectivity check |
| `POST` | `/api/v1/auth/request-otp` | Public | Request a 6-digit passwordless Email OTP |
| `POST` | `/api/v1/auth/verify-otp` | Public | Verify OTP, register/login customer, set `HttpOnly` JWT cookies |
| `POST` | `/api/v1/auth/refresh` | Refresh Cookie | Rotate refresh token & issue fresh access + refresh cookies |
| `POST` | `/api/v1/auth/logout` | Optional Cookie | Revoke current refresh token & clear auth cookies |
| `POST` | `/api/v1/auth/logout-all` | Access Cookie | Revoke all active refresh tokens for the customer |
| `GET` | `/api/v1/auth/me` | Access Cookie | Get currently authenticated customer profile |
| `GET` | `/api/v1/categories` | Public | List active categories & nested active subcategories with market-aware counts (`?country=IN\|US`) and SEO |
| `GET` | `/api/v1/categories/:slug` | Public | Get active category/subcategory details by slug (`?country=IN\|US`, with parent breadcrumb) |
| `GET` | `/api/v1/products` | Public | Paginated catalog listing with regional pricing (`?country=IN\|US`), search (`search`/`q`), category, stock, sale, price range, and sort |
| `GET` | `/api/v1/products/:slug` | Public | Full customer-safe product detail (`?country=IN\|US`, regional variant pricing, shared stock, unified image+video media, certificate, specs, shipping, SEO) |
| `GET` | `/api/v1/banners` | Public | List active, in-schedule homepage banners (`?placement=homepage_hero\|homepage_promo&limit=10`) |
| `GET` | `/api/v1/profile` | Access Cookie | Get authenticated customer profile + current `defaultAddress` |
| `PATCH` | `/api/v1/profile` | Access Cookie | Update customer `fullName` and/or `phone` |
| `GET` | `/api/v1/addresses/lookup` | Public | Self-hosted MySQL postal code lookup (`?country=IN\|US&postalCode=...`) returning `city`, `district`, `state`, `stateCode` |
| `GET` | `/api/v1/addresses` | Access Cookie | List saved customer addresses (`?country=IN\|US`, ordered by `isDefault DESC`) |
| `GET` | `/api/v1/addresses/:id` | Access Cookie | Get a single owned customer address |
| `POST` | `/api/v1/addresses` | Access Cookie | Create a customer address (auto-fills `city`/`district`/`state` or accepts manual entry) |
| `PATCH` | `/api/v1/addresses/:id` | Access Cookie | Update an owned customer address |
| `PATCH` | `/api/v1/addresses/:id/default` | Access Cookie | Designate an owned address as the customer's default shipping address |
| `DELETE` | `/api/v1/addresses/:id` | Access Cookie | Soft-delete an owned address (auto-promotes next most recent address if default) |
| `GET` | `/api/v1/coupons` | Public | List active, non-expired, non-exhausted `public` coupons (`?country=IN\|US`) |
| `POST` | `/api/v1/coupons/validate` | Public | Validate Browser-First Cart items (live regional prices, stock & shipping) and optional `public` or `hidden` `couponCode` |
| `GET` | `/api/v1/checkout/shipping` | Public | Get active shipping rule (`flatCharge`, `freeShippingThreshold`) for `?country=IN\|US` |
| `POST` | `/api/v1/checkout/create-order` | Access Cookie | Atomically reserve/deduct stock & coupon, create immutable order + Razorpay order (`INR`/`USD`) |
| `POST` | `/api/v1/checkout/verify-payment` | Access Cookie | Verify Razorpay payment signature (idempotent) and confirm order |
| `POST` | `/api/v1/webhooks/razorpay` | Razorpay HMAC | Server-to-server Razorpay webhook (`payment.captured` / `order.paid`) |
| `GET` | `/api/v1/orders` | Access Cookie | Paginated customer order history (`?page=1&limit=10&status=...`) |
| `GET` | `/api/v1/orders/:orderNumber` | Access Cookie | Get full customer order details, payment summary, and shipment tracking |
| `GET` | `/api/v1/orders/:orderNumber/invoice` | Access Cookie | Get structured GST / Export invoice JSON with independent sequential `invoiceNumber` |
| `GET` | `/api/v1/orders/:orderNumber/invoice/pdf` | Access Cookie | Download (`?disposition=attachment\|inline`) A4 PDF invoice (`application/pdf`) |
| `POST` | `/api/v1/orders/:orderNumber/retry-payment` | Access Cookie | Resume Razorpay payment for a `pending_payment` order |
| `POST` | `/api/v1/orders/:orderNumber/cancel` | Access Cookie | Pre-shipment self-cancellation (restores stock/coupon; preserves order & payment history) |
