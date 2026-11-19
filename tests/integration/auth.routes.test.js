import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../app.js';
import { createAuthService } from '../../services/auth.service.js';
import tokenService from '../../services/token.service.js';
import otpService from '../../services/otp.service.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createInMemoryAuthStore() {
  const users = [];
  const otps = [];
  const refreshTokens = [];

  const matchesWhere = (record, where = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value === null) {
        return record[key] === null || record[key] === undefined;
      }
      return record[key] === value;
    });

  const wrapUser = (record) => {
    if (!record) return null;
    return Object.assign(record, {
      async update(fields) {
        Object.assign(record, fields, { updated_at: new Date() });
        return wrapUser(record);
      },
    });
  };

  const User = {
    async findOne({ where }) {
      const found = users.find((u) => !u.deleted_at && matchesWhere(u, where));
      return wrapUser(found || null);
    },
    async findByPk(id) {
      const found = users.find((u) => !u.deleted_at && u.id === id);
      return wrapUser(found || null);
    },
    async create(data) {
      const now = new Date();
      const record = {
        fullName: null,
        phone: null,
        isEmailVerified: false,
        status: 'active',
        lastLoginAt: null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
        ...data,
        id: data.id || crypto.randomUUID(),
      };
      users.push(record);
      return wrapUser(record);
    },
  };

  const UserOtp = {
    async findOne({ where, order }) {
      let filtered = otps.filter((o) => matchesWhere(o, where));
      if (order?.[0]?.[0] === 'created_at' && order[0][1] === 'DESC') {
        filtered = [...filtered].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      return filtered[0] || null;
    },
    async create(data) {
      const record = {
        attempts: 0,
        maxAttempts: 5,
        consumedAt: null,
        created_at: new Date(),
        ...data,
        id: data.id || crypto.randomUUID(),
      };
      otps.push(record);
      return record;
    },
    async update(fields, { where }) {
      let count = 0;
      for (const record of otps) {
        if (matchesWhere(record, where)) {
          Object.assign(record, fields);
          count += 1;
        }
      }
      return [count];
    },
    async destroy({ where }) {
      let removed = 0;
      for (let i = otps.length - 1; i >= 0; i -= 1) {
        if (matchesWhere(otps[i], where)) {
          otps.splice(i, 1);
          removed += 1;
        }
      }
      return removed;
    },
  };

  const UserRefreshToken = {
    async findOne({ where }) {
      return refreshTokens.find((t) => matchesWhere(t, where)) || null;
    },
    async create(data) {
      const record = {
        revokedAt: null,
        replacedByTokenId: null,
        created_at: new Date(),
        ...data,
        id: data.id || crypto.randomUUID(),
      };
      refreshTokens.push(record);
      return record;
    },
    async update(fields, { where }) {
      let count = 0;
      for (const record of refreshTokens) {
        if (matchesWhere(record, where)) {
          Object.assign(record, fields);
          count += 1;
        }
      }
      return [count];
    },
  };

  const sequelize = {
    healthy: true,
    async authenticate() {
      if (!this.healthy) {
        throw new Error('DB down');
      }
    },
    async transaction(callback) {
      return callback({});
    },
  };

  return { users, otps, refreshTokens, User, UserOtp, UserRefreshToken, sequelize };
}

function extractCookies(setCookieHeaders = []) {
  const cookies = {};
  for (const header of setCookieHeaders) {
    const [pair] = header.split(';');
    const eqIndex = pair.indexOf('=');
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    cookies[name] = { value, raw: header };
  }
  return cookies;
}

describe('Customer Auth API integration tests (/api/v1)', () => {
  let store;
  let sentEmails;
  let failNextEmail;
  let app;

  beforeEach(() => {
    store = createInMemoryAuthStore();
    sentEmails = [];
    failNextEmail = false;

    const emailService = {
      async sendOtpEmail(payload) {
        if (failNextEmail) {
          failNextEmail = false;
          throw new Error('SMTP connection refused');
        }
        sentEmails.push(payload);
        return { delivered: true, transport: 'mock' };
      },
    };

    const authService = createAuthService({
      sequelize: store.sequelize,
      User: store.User,
      UserOtp: store.UserOtp,
      UserRefreshToken: store.UserRefreshToken,
      otpService,
      tokenService,
      emailService,
      otpConfig: {
        hmacSecret: 'test_hmac_secret',
        expiryMinutes: 10,
        resendCooldownSeconds: 60,
        maxAttempts: 5,
      },
    });

    app = createApp({
      sequelize: store.sequelize,
      User: store.User,
      authService,
      tokenService,
      enableRateLimit: false,
    });
  });

  describe('GET /api/v1/health', () => {
    it('returns 200 when database is healthy and 503 when unavailable', async () => {
      const okRes = await request(app).get('/api/v1/health');
      assert.equal(okRes.status, 200);
      assert.equal(okRes.body.success, true);
      assert.equal(okRes.body.data.database, 'connected');

      store.sequelize.healthy = false;
      const errRes = await request(app).get('/api/v1/health');
      assert.equal(errRes.status, 503);
      assert.equal(errRes.body.success, false);
      assert.equal(errRes.body.error.code, 'SERVICE_UNAVAILABLE');
    });
  });

  describe('POST /api/v1/auth/request-otp', () => {
    it('validates email, stores hashed UUID v4 OTP, and sends 6-digit code', async () => {
      const res = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: '  Ananya@Example.com  ' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.email, 'ananya@example.com');
      assert.equal(res.body.data.expiresInSeconds, 600);
      assert.equal(res.body.data.resendCooldownSeconds, 60);

      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0].to, 'ananya@example.com');
      assert.match(sentEmails[0].otp, /^\d{6}$/);

      assert.equal(store.otps.length, 1);
      assert.match(store.otps[0].id, UUID_V4_REGEX);
      assert.notEqual(store.otps[0].otpHash, sentEmails[0].otp);
      assert.equal(store.otps[0].otpHash.length, 64);
    });

    it('rejects invalid email and malformed JSON', async () => {
      const badEmail = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: 'not-an-email' });
      assert.equal(badEmail.status, 400);
      assert.equal(badEmail.body.error.code, 'VALIDATION_ERROR');

      const badJson = await request(app)
        .post('/api/v1/auth/request-otp')
        .set('Content-Type', 'application/json')
        .send('{bad-json');
      assert.equal(badJson.status, 400);
      assert.equal(badJson.body.error.code, 'INVALID_JSON');
    });

    it('enforces resend cooldown and supersedes previous OTP after cooldown elapses', async () => {
      await request(app).post('/api/v1/auth/request-otp').send({ email: 'buyer@example.com' });

      const cooldownRes = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: 'buyer@example.com' });
      assert.equal(cooldownRes.status, 429);
      assert.equal(cooldownRes.body.error.code, 'OTP_COOLDOWN_ACTIVE');
      assert.ok(cooldownRes.body.error.details[0].retryAfterSeconds > 0);

      // Simulate cooldown elapsed
      store.otps[0].created_at = new Date(Date.now() - 61 * 1000);
      const firstOtp = sentEmails[0].otp;

      const resendRes = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: 'buyer@example.com' });
      assert.equal(resendRes.status, 200);
      assert.equal(sentEmails.length, 2);
      assert.ok(store.otps[0].consumedAt instanceof Date);

      // Old OTP should no longer verify
      const oldVerifyRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'buyer@example.com', otp: firstOtp });
      assert.equal(oldVerifyRes.status, 401);
    });

    it('cleans up OTP record if email delivery fails so user is not blocked by cooldown', async () => {
      failNextEmail = true;
      const failRes = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: 'retry@example.com' });
      assert.equal(failRes.status, 503);
      assert.equal(failRes.body.error.code, 'EMAIL_DELIVERY_FAILED');
      assert.equal(store.otps.length, 0);

      const retryRes = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: 'retry@example.com' });
      assert.equal(retryRes.status, 200);
    });
  });

  describe('POST /api/v1/auth/verify-otp & GET /api/v1/auth/me', () => {
    it('registers a new customer with UUID v4, sets HttpOnly cookies, and authenticates /me', async () => {
      await request(app).post('/api/v1/auth/request-otp').send({ email: 'newuser@example.com' });
      const otp = sentEmails[0].otp;

      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'newuser@example.com', otp });

      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.success, true);
      assert.equal(verifyRes.body.data.isNewUser, true);
      assert.equal(verifyRes.body.data.user.email, 'newuser@example.com');
      assert.equal(verifyRes.body.data.user.isEmailVerified, true);
      assert.match(verifyRes.body.data.user.id, UUID_V4_REGEX);

      const cookies = extractCookies(verifyRes.headers['set-cookie']);
      assert.ok(cookies.japaika_user_access?.value);
      assert.ok(cookies.japaika_user_refresh?.value);
      assert.match(cookies.japaika_user_access.raw, /HttpOnly/i);
      assert.match(cookies.japaika_user_access.raw, /SameSite=Lax/i);
      assert.match(cookies.japaika_user_access.raw, /Path=\//i);
      assert.match(cookies.japaika_user_refresh.raw, /HttpOnly/i);
      assert.match(cookies.japaika_user_refresh.raw, /Path=\/api\/v1\/auth/i);

      // Refresh token is stored hashed with UUID v4 id and familyId
      assert.equal(store.refreshTokens.length, 1);
      assert.match(store.refreshTokens[0].id, UUID_V4_REGEX);
      assert.match(store.refreshTokens[0].familyId, UUID_V4_REGEX);
      assert.notEqual(store.refreshTokens[0].tokenHash, cookies.japaika_user_refresh.value);
      assert.equal(store.refreshTokens[0].tokenHash.length, 64);

      // Single-use OTP replay must fail
      const replayRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'newuser@example.com', otp });
      assert.equal(replayRes.status, 401);
      assert.equal(replayRes.body.error.code, 'OTP_EXPIRED');

      // Authenticated /me succeeds with access cookie
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `japaika_user_access=${cookies.japaika_user_access.value}`);
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.user.id, verifyRes.body.data.user.id);

      // /me rejects missing cookie and rejects refresh token used as access token
      const noAuthRes = await request(app).get('/api/v1/auth/me');
      assert.equal(noAuthRes.status, 401);
      assert.equal(noAuthRes.body.error.code, 'UNAUTHORIZED');

      const wrongTokenRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `japaika_user_access=${cookies.japaika_user_refresh.value}`);
      assert.equal(wrongTokenRes.status, 401);
    });

    it('logs in an existing customer with isNewUser: false', async () => {
      await store.User.create({
        email: 'returning@example.com',
        fullName: 'Rajesh Kumar',
        isEmailVerified: true,
        status: 'active',
      });

      await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: 'returning@example.com' });

      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'returning@example.com', otp: sentEmails[0].otp });

      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.data.isNewUser, false);
      assert.equal(verifyRes.body.data.user.fullName, 'Rajesh Kumar');
    });

    it('enforces max OTP attempts and invalidates OTP after 5 wrong tries', async () => {
      await request(app).post('/api/v1/auth/request-otp').send({ email: 'brute@example.com' });
      const wrongOtp = sentEmails[0].otp === '000000' ? '111111' : '000000';

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const res = await request(app)
          .post('/api/v1/auth/verify-otp')
          .send({ email: 'brute@example.com', otp: wrongOtp });
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'INVALID_OTP');
        assert.equal(res.body.error.details[0].remainingAttempts, 5 - attempt);
      }

      const fifthRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'brute@example.com', otp: wrongOtp });
      assert.equal(fifthRes.status, 401);
      assert.equal(fifthRes.body.error.code, 'OTP_MAX_ATTEMPTS_EXCEEDED');

      // Even the correct OTP is now rejected because the record was consumed
      const afterMaxRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'brute@example.com', otp: sentEmails[0].otp });
      assert.equal(afterMaxRes.status, 401);
      assert.equal(afterMaxRes.body.error.code, 'OTP_EXPIRED');
    });

    it('rejects expired OTP and suspended customer accounts with 403', async () => {
      await request(app).post('/api/v1/auth/request-otp').send({ email: 'expired@example.com' });
      store.otps[0].expiresAt = new Date(Date.now() - 1000);

      const expiredRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'expired@example.com', otp: sentEmails[0].otp });
      assert.equal(expiredRes.status, 401);
      assert.equal(expiredRes.body.error.code, 'OTP_EXPIRED');

      await store.User.create({
        email: 'suspended@example.com',
        isEmailVerified: true,
        status: 'suspended',
      });
      await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: 'suspended@example.com' });

      const suspendedRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'suspended@example.com', otp: sentEmails[1].otp });
      assert.equal(suspendedRes.status, 403);
      assert.equal(suspendedRes.body.error.code, 'ACCOUNT_SUSPENDED');
      assert.equal(suspendedRes.headers['set-cookie'], undefined);
    });
  });

  describe('POST /api/v1/auth/refresh, /logout, and /logout-all', () => {
    it('rotates refresh tokens and revokes entire family on token reuse', async () => {
      await request(app).post('/api/v1/auth/request-otp').send({ email: 'rotate@example.com' });
      const loginRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'rotate@example.com', otp: sentEmails[0].otp });

      const initialCookies = extractCookies(loginRes.headers['set-cookie']);
      const token1 = initialCookies.japaika_user_refresh.value;

      // Refresh #1 succeeds and rotates token
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${token1}`);

      assert.equal(refreshRes.status, 200);
      const rotatedCookies = extractCookies(refreshRes.headers['set-cookie']);
      const token2 = rotatedCookies.japaika_user_refresh.value;
      assert.notEqual(token2, token1);
      assert.equal(store.refreshTokens.length, 2);
      assert.ok(store.refreshTokens[0].revokedAt instanceof Date);
      assert.equal(store.refreshTokens[0].replacedByTokenId, store.refreshTokens[1].id);
      assert.equal(store.refreshTokens[0].familyId, store.refreshTokens[1].familyId);

      // Reusing token1 triggers family revocation
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${token1}`);
      assert.equal(reuseRes.status, 401);
      assert.equal(reuseRes.body.error.code, 'REFRESH_TOKEN_REUSE_DETECTED');
      assert.ok(store.refreshTokens[1].revokedAt instanceof Date);

      // Token2 in the compromised family is now rejected too
      const afterCompromiseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${token2}`);
      assert.equal(afterCompromiseRes.status, 401);
    });

    it('revokes session on /logout and revokes all devices on /logout-all', async () => {
      // Login device 1
      await request(app).post('/api/v1/auth/request-otp').send({ email: 'multi@example.com' });
      const login1 = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'multi@example.com', otp: sentEmails[0].otp });
      const cookies1 = extractCookies(login1.headers['set-cookie']);

      // Simulate cooldown elapsed and login device 2
      store.otps[0].created_at = new Date(Date.now() - 61 * 1000);
      await request(app).post('/api/v1/auth/request-otp').send({ email: 'multi@example.com' });
      const login2 = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'multi@example.com', otp: sentEmails[1].otp });
      const cookies2 = extractCookies(login2.headers['set-cookie']);

      // Single logout revokes device 1 only
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `japaika_user_refresh=${cookies1.japaika_user_refresh.value}`);
      assert.equal(logoutRes.status, 200);

      const refresh1AfterLogout = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${cookies1.japaika_user_refresh.value}`);
      assert.equal(refresh1AfterLogout.status, 401);

      // Logout-all from device 2 revokes device 2 as well
      const logoutAllRes = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Cookie', `japaika_user_access=${cookies2.japaika_user_access.value}`);
      assert.equal(logoutAllRes.status, 200);

      const refresh2AfterLogoutAll = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${cookies2.japaika_user_refresh.value}`);
      assert.equal(refresh2AfterLogoutAll.status, 401);
    });

    it('blocks suspended account on /me and /refresh with 403 ACCOUNT_SUSPENDED', async () => {
      await request(app).post('/api/v1/auth/request-otp').send({ email: 'blockme@example.com' });
      const login = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'blockme@example.com', otp: sentEmails[0].otp });
      const cookies = extractCookies(login.headers['set-cookie']);

      store.users[0].status = 'suspended';

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `japaika_user_access=${cookies.japaika_user_access.value}`);
      assert.equal(meRes.status, 403);
      assert.equal(meRes.body.error.code, 'ACCOUNT_SUSPENDED');

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${cookies.japaika_user_refresh.value}`);
      assert.equal(refreshRes.status, 403);
      assert.equal(refreshRes.body.error.code, 'ACCOUNT_SUSPENDED');
    });
  });

  describe('Rate limiting middleware', () => {
    it('returns 429 RATE_LIMIT_EXCEEDED when email OTP request limit is exceeded', async () => {
      const rateLimitedApp = createApp({
        sequelize: store.sequelize,
        User: store.User,
        authService: {
          async requestOtp({ email }) {
            return { email, expiresInSeconds: 600, resendCooldownSeconds: 60 };
          },
        },
        tokenService,
        enableRateLimit: true,
      });

      for (let i = 0; i < 5; i += 1) {
        const res = await request(rateLimitedApp)
          .post('/api/v1/auth/request-otp')
          .send({ email: 'limited@example.com' });
        assert.equal(res.status, 200);
      }

      const sixth = await request(rateLimitedApp)
        .post('/api/v1/auth/request-otp')
        .send({ email: 'limited@example.com' });
      assert.equal(sixth.status, 429);
      assert.equal(sixth.body.error.code, 'RATE_LIMIT_EXCEEDED');
    });
  });
});
