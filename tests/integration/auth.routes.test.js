import { describe, it, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../app.js';
import { sequelize, User, UserOtp, UserRefreshToken } from '../../models/index.js';
import emailService from '../../services/email.service.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractCookies(setCookieHeaders = []) {
  const cookies = {};
  for (const header of setCookieHeaders) {
    const [pair] = header.split(';');
    const eqIndex = pair.indexOf('=');
    cookies[pair.slice(0, eqIndex).trim()] = {
      value: pair.slice(eqIndex + 1).trim(),
      raw: header,
    };
  }
  return cookies;
}

describe('Customer Auth API integration tests (/api/v1)', () => {
  const testEmails = new Set();
  let sentEmails = [];
  let failNextEmail = false;
  let emailMock;

  const makeTestEmail = (label) => {
    const email = `test.${label}.${crypto.randomUUID()}@japaika-test.local`;
    testEmails.add(email);
    return email;
  };

  const expireCooldown = (email) =>
    sequelize.query(
      'UPDATE user_otps SET created_at = DATE_SUB(created_at, INTERVAL 61 SECOND) WHERE email = ?',
      { replacements: [email] }
    );

  beforeEach(() => {
    process.env.DISABLE_RATE_LIMIT = 'true';
    sentEmails = [];
    failNextEmail = false;
    emailMock = mock.method(emailService, 'sendOtpEmail', async (payload) => {
      if (failNextEmail) {
        failNextEmail = false;
        throw new Error('SMTP connection refused');
      }
      sentEmails.push(payload);
      return { delivered: true, transport: 'mock' };
    });
  });

  afterEach(async () => {
    emailMock?.mock.restore();
    delete process.env.DISABLE_RATE_LIMIT;

    for (const email of testEmails) {
      await UserOtp.destroy({ where: { email } });
      const user = await User.findOne({ where: { email }, paranoid: false });
      if (user) {
        await UserRefreshToken.destroy({ where: { userId: user.id } });
        await User.destroy({ where: { id: user.id }, force: true });
      }
    }
    testEmails.clear();
  });

  after(async () => {
    await sequelize.close();
  });

  describe('GET /api/v1/health', () => {
    it('returns 200 when database is healthy and 503 when unavailable', async () => {
      const okRes = await request(app).get('/api/v1/health');
      assert.equal(okRes.status, 200);
      assert.equal(okRes.body.success, true);
      assert.equal(okRes.body.data.database, 'connected');

      const authStub = mock.method(sequelize, 'authenticate', async () => {
        throw new Error('DB down');
      });
      try {
        const errRes = await request(app).get('/api/v1/health');
        assert.equal(errRes.status, 503);
        assert.equal(errRes.body.error.code, 'SERVICE_UNAVAILABLE');
      } finally {
        authStub.mock.restore();
      }
    });
  });

  describe('POST /api/v1/auth/request-otp', () => {
    it('validates email, stores hashed UUID v4 OTP in MySQL, and sends 6-digit code', async () => {
      const email = makeTestEmail('req');
      const res = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email: `  ${email.toUpperCase()}  ` });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.email, email);
      assert.equal(sentEmails.length, 1);
      assert.match(sentEmails[0].otp, /^\d{6}$/);

      const otpRow = await UserOtp.findOne({ where: { email } });
      assert.ok(otpRow);
      assert.match(otpRow.id, UUID_V4_REGEX);
      assert.notEqual(otpRow.otpHash, sentEmails[0].otp);
      assert.equal(otpRow.otpHash.length, 64);
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
      const email = makeTestEmail('cooldown');
      await request(app).post('/api/v1/auth/request-otp').send({ email });

      const cooldownRes = await request(app).post('/api/v1/auth/request-otp').send({ email });
      assert.equal(cooldownRes.status, 429);
      assert.equal(cooldownRes.body.error.code, 'OTP_COOLDOWN_ACTIVE');

      // Backdate first OTP to simulate elapsed cooldown
      const firstOtp = sentEmails[0].otp;
      await expireCooldown(email);

      const resendRes = await request(app).post('/api/v1/auth/request-otp').send({ email });
      assert.equal(resendRes.status, 200);
      assert.equal(sentEmails.length, 2);

      // Old OTP is superseded and rejected
      const oldVerify = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, otp: firstOtp });
      assert.equal(oldVerify.status, 401);
    });

    it('cleans up OTP record if email delivery fails so user is not blocked by cooldown', async () => {
      const email = makeTestEmail('mailfail');
      failNextEmail = true;

      const failRes = await request(app).post('/api/v1/auth/request-otp').send({ email });
      assert.equal(failRes.status, 503);
      assert.equal(failRes.body.error.code, 'EMAIL_DELIVERY_FAILED');
      assert.equal(await UserOtp.count({ where: { email } }), 0);

      const retryRes = await request(app).post('/api/v1/auth/request-otp').send({ email });
      assert.equal(retryRes.status, 200);
    });
  });

  describe('POST /api/v1/auth/verify-otp & GET /api/v1/auth/me', () => {
    it('registers a new verified customer, sets HttpOnly cookies, and authenticates /me', async () => {
      const email = makeTestEmail('newuser');
      await request(app).post('/api/v1/auth/request-otp').send({ email });
      const otp = sentEmails[0].otp;

      const verifyRes = await request(app).post('/api/v1/auth/verify-otp').send({ email, otp });
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.data.isNewUser, true);
      assert.equal(verifyRes.body.data.user.isEmailVerified, true);
      assert.match(verifyRes.body.data.user.id, UUID_V4_REGEX);

      const cookies = extractCookies(verifyRes.headers['set-cookie']);
      assert.match(cookies.japaika_user_access.raw, /HttpOnly/i);
      assert.match(cookies.japaika_user_access.raw, /SameSite=Lax/i);
      assert.match(cookies.japaika_user_refresh.raw, /Path=\/api\/v1\/auth/i);

      // Single-use OTP replay rejected
      const replayRes = await request(app).post('/api/v1/auth/verify-otp').send({ email, otp });
      assert.equal(replayRes.status, 401);
      assert.equal(replayRes.body.error.code, 'OTP_EXPIRED');

      // /me succeeds with access cookie and rejects missing or refresh cookie
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `japaika_user_access=${cookies.japaika_user_access.value}`);
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.user.id, verifyRes.body.data.user.id);

      assert.equal((await request(app).get('/api/v1/auth/me')).status, 401);
      const wrongCookie = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `japaika_user_access=${cookies.japaika_user_refresh.value}`);
      assert.equal(wrongCookie.status, 401);
    });

    it('logs in an existing customer with isNewUser: false', async () => {
      const email = makeTestEmail('existing');
      await User.create({ email, fullName: 'Rajesh Kumar', isEmailVerified: true, status: 'active' });

      await request(app).post('/api/v1/auth/request-otp').send({ email });
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, otp: sentEmails[0].otp });

      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.data.isNewUser, false);
      assert.equal(verifyRes.body.data.user.fullName, 'Rajesh Kumar');
    });

    it('enforces max OTP attempts and invalidates OTP after 5 wrong tries', async () => {
      const email = makeTestEmail('attempts');
      await request(app).post('/api/v1/auth/request-otp').send({ email });
      const wrongOtp = sentEmails[0].otp === '000000' ? '111111' : '000000';

      for (let i = 1; i <= 4; i += 1) {
        const res = await request(app).post('/api/v1/auth/verify-otp').send({ email, otp: wrongOtp });
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'INVALID_OTP');
        assert.equal(res.body.error.details[0].remainingAttempts, 5 - i);
      }

      const fifth = await request(app).post('/api/v1/auth/verify-otp').send({ email, otp: wrongOtp });
      assert.equal(fifth.status, 401);
      assert.equal(fifth.body.error.code, 'OTP_MAX_ATTEMPTS_EXCEEDED');

      const correctAfterLockout = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, otp: sentEmails[0].otp });
      assert.equal(correctAfterLockout.status, 401);
    });

    it('rejects expired OTP and suspended accounts with 403', async () => {
      const expiredEmail = makeTestEmail('expired');
      await request(app).post('/api/v1/auth/request-otp').send({ email: expiredEmail });
      await UserOtp.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { email: expiredEmail } });

      const expiredRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: expiredEmail, otp: sentEmails[0].otp });
      assert.equal(expiredRes.status, 401);
      assert.equal(expiredRes.body.error.code, 'OTP_EXPIRED');

      const suspendedEmail = makeTestEmail('suspended');
      await User.create({ email: suspendedEmail, isEmailVerified: true, status: 'suspended' });
      await request(app).post('/api/v1/auth/request-otp').send({ email: suspendedEmail });

      const suspendedRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: suspendedEmail, otp: sentEmails[1].otp });
      assert.equal(suspendedRes.status, 403);
      assert.equal(suspendedRes.body.error.code, 'ACCOUNT_SUSPENDED');
      assert.equal(suspendedRes.headers['set-cookie'], undefined);
    });
  });

  describe('POST /api/v1/auth/refresh, /logout, and /logout-all', () => {
    it('rotates refresh tokens and revokes entire family on reuse', async () => {
      const email = makeTestEmail('rotate');
      await request(app).post('/api/v1/auth/request-otp').send({ email });
      const loginRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, otp: sentEmails[0].otp });

      const token1 = extractCookies(loginRes.headers['set-cookie']).japaika_user_refresh.value;

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${token1}`);
      assert.equal(refreshRes.status, 200);
      const token2 = extractCookies(refreshRes.headers['set-cookie']).japaika_user_refresh.value;
      assert.notEqual(token2, token1);

      // Reusing token1 revokes entire family
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${token1}`);
      assert.equal(reuseRes.status, 401);
      assert.equal(reuseRes.body.error.code, 'REFRESH_TOKEN_REUSE_DETECTED');

      const afterCompromise = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `japaika_user_refresh=${token2}`);
      assert.equal(afterCompromise.status, 401);
    });

    it('revokes session on /logout and all devices on /logout-all', async () => {
      const email = makeTestEmail('logout');

      // Device 1
      await request(app).post('/api/v1/auth/request-otp').send({ email });
      const login1 = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, otp: sentEmails[0].otp });
      const cookies1 = extractCookies(login1.headers['set-cookie']);

      // Device 2 after simulated cooldown
      await expireCooldown(email);
      await request(app).post('/api/v1/auth/request-otp').send({ email });
      const login2 = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, otp: sentEmails[1].otp });
      const cookies2 = extractCookies(login2.headers['set-cookie']);

      // Single logout revokes device 1 only
      assert.equal(
        (
          await request(app)
            .post('/api/v1/auth/logout')
            .set('Cookie', `japaika_user_refresh=${cookies1.japaika_user_refresh.value}`)
        ).status,
        200
      );
      assert.equal(
        (
          await request(app)
            .post('/api/v1/auth/refresh')
            .set('Cookie', `japaika_user_refresh=${cookies1.japaika_user_refresh.value}`)
        ).status,
        401
      );

      // Logout-all revokes device 2 as well
      assert.equal(
        (
          await request(app)
            .post('/api/v1/auth/logout-all')
            .set('Cookie', `japaika_user_access=${cookies2.japaika_user_access.value}`)
        ).status,
        200
      );
      assert.equal(
        (
          await request(app)
            .post('/api/v1/auth/refresh')
            .set('Cookie', `japaika_user_refresh=${cookies2.japaika_user_refresh.value}`)
        ).status,
        401
      );
    });

    it('blocks suspended account on /me and /refresh with 403 ACCOUNT_SUSPENDED', async () => {
      const email = makeTestEmail('block');
      await request(app).post('/api/v1/auth/request-otp').send({ email });
      const login = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, otp: sentEmails[0].otp });
      const cookies = extractCookies(login.headers['set-cookie']);

      await User.update({ status: 'suspended' }, { where: { email } });

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
    it('returns 429 RATE_LIMIT_EXCEEDED after 5 email OTP requests', async () => {
      process.env.DISABLE_RATE_LIMIT = 'false';
      const email = makeTestEmail('ratelimit');

      for (let i = 0; i < 5; i += 1) {
        const res = await request(app).post('/api/v1/auth/request-otp').send({ email });
        assert.equal(res.status, 200);
        await expireCooldown(email);
      }

      const sixth = await request(app).post('/api/v1/auth/request-otp').send({ email });
      assert.equal(sixth.status, 429);
      assert.equal(sixth.body.error.code, 'RATE_LIMIT_EXCEEDED');
    });
  });
});
