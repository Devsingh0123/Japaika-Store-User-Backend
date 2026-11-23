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
   Create `.env` (using `.env.example` as a reference) with your local MySQL credentials (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) and 3 customer auth secrets (`USER_JWT_ACCESS_SECRET`, `USER_JWT_REFRESH_SECRET`, `OTP_HMAC_SECRET`):
   - Leave `SMTP_HOST` unset locally to log OTP codes directly to the server console.
   - Set `SMTP_HOST` (plus `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`) for staging/production (`SMTP_HOST` is mandatory in `NODE_ENV=production`).

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
   - `20261123000900-create-product-images.cjs` (`product_images`)

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
