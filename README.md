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
   Copy `.env.example` to `.env` and fill in your local MySQL credentials and secrets:
   - Use `EMAIL_TRANSPORT=console` for local development (OTP codes print to the server console).
   - Use `EMAIL_TRANSPORT=smtp` with valid SMTP credentials in staging/production (`console` transport is blocked in `NODE_ENV=production`).

3. **Create the MySQL database and run migrations**:
   ```bash
   npm run migrate
   ```
   Other migration commands:
   - `npm run migrate:status` — Inspect applied/pending migrations
   - `npm run migrate:undo` — Roll back the most recent migration

   > **Important:** Never run `sequelize.sync({ force: true })` or `sequelize.sync({ alter: true })` against shared databases. Always use versioned `sequelize-cli` migrations.

4. **Start the server**:
   ```bash
   npm start        # Development (nodemon)
   npm run start:prod  # Production (node)
   ```

---

## Automated Tests

Run all unit and integration tests (fully isolated; never modifies shared development or production databases):

```bash
npm test
```

---

## Implemented Endpoints (`/api/v1`)

See [../docs/USER_API_CONTRACTS.md](../docs/USER_API_CONTRACTS.md) for full request/response schemas and error codes.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Service & MySQL connectivity check |
| `POST` | `/api/v1/auth/request-otp` | Public | Request a 6-digit passwordless Email OTP |
| `POST` | `/api/v1/auth/verify-otp` | Public | Verify OTP, register/login customer, set `HttpOnly` JWT cookies |
| `POST` | `/api/v1/auth/refresh` | Refresh Cookie | Rotate refresh token & issue fresh access + refresh cookies |
| `POST` | `/api/v1/auth/logout` | Optional Cookie | Revoke current refresh token & clear auth cookies |
| `POST` | `/api/v1/auth/logout-all` | Access Cookie | Revoke all active refresh tokens for the customer |
| `GET` | `/api/v1/auth/me` | Access Cookie | Get currently authenticated customer profile |
