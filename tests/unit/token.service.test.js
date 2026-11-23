import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  getJwtSecrets,
  parseDurationToMs,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../services/token.service.js';
import { getOtpHmacSecret } from '../../services/auth.service.js';
import { getEmailConfig } from '../../services/email.service.js';

describe('token.service', () => {
  it('parses duration strings into milliseconds', () => {
    assert.equal(parseDurationToMs('15m', 0), 15 * 60 * 1000);
    assert.equal(parseDurationToMs('30d', 0), 30 * 24 * 60 * 60 * 1000);
    assert.equal(parseDurationToMs('60s', 0), 60 * 1000);
    assert.equal(parseDurationToMs('2h', 0), 2 * 60 * 60 * 1000);
    assert.equal(parseDurationToMs('invalid', 1234), 1234);
  });

  it('signs and verifies customer access tokens with strict claims', () => {
    const user = { id: crypto.randomUUID(), email: 'buyer@example.com' };
    const payload = verifyAccessToken(signAccessToken(user));

    assert.equal(payload.sub, user.id);
    assert.equal(payload.email, user.email);
    assert.equal(payload.subType, 'customer');
    assert.equal(payload.tokenType, 'access');
    assert.equal(payload.iss, 'japaika-user-backend');
    assert.equal(payload.aud, 'japaika-user');
  });

  it('rejects refresh tokens and foreign tokens when verifying access tokens', () => {
    const userId = crypto.randomUUID();
    const refreshToken = signRefreshToken({
      userId,
      tokenId: crypto.randomUUID(),
      familyId: crypto.randomUUID(),
    });

    assert.throws(() => verifyAccessToken(refreshToken), { code: 'UNAUTHORIZED' });

    const adminLikeToken = jwt.sign(
      { sub: userId, subType: 'admin', tokenType: 'access' },
      'different_admin_secret_at_least_32_characters_long',
      { issuer: 'japaika-admin-backend', audience: 'japaika-admin', expiresIn: '15m' }
    );
    assert.throws(() => verifyAccessToken(adminLikeToken), { code: 'UNAUTHORIZED' });
  });

  it('signs and verifies customer refresh tokens and rejects access tokens', () => {
    const userId = crypto.randomUUID();
    const tokenId = crypto.randomUUID();
    const familyId = crypto.randomUUID();

    const payload = verifyRefreshToken(signRefreshToken({ userId, tokenId, familyId }));
    assert.equal(payload.sub, userId);
    assert.equal(payload.jti, tokenId);
    assert.equal(payload.familyId, familyId);
    assert.equal(payload.subType, 'customer');
    assert.equal(payload.tokenType, 'refresh');

    const accessToken = signAccessToken({ id: userId, email: 'buyer@example.com' });
    assert.throws(() => verifyRefreshToken(accessToken), { code: 'INVALID_REFRESH_TOKEN' });
  });

  it('hashes raw tokens deterministically with SHA-256', () => {
    const h1 = hashToken('sample-token-value');
    assert.equal(h1.length, 64);
    assert.equal(h1, hashToken('sample-token-value'));
    assert.notEqual(h1, hashToken('different-token-value'));
  });
});

describe('production environment safety checks', () => {
  it('rejects identical access and refresh secrets and placeholder secrets in production', () => {
    const sameSecret = 'a_shared_secret_value_that_is_over_32_chars_long';
    assert.throws(
      () => getJwtSecrets({ USER_JWT_ACCESS_SECRET: sameSecret, USER_JWT_REFRESH_SECRET: sameSecret }),
      /must differ/
    );

    assert.throws(
      () =>
        getJwtSecrets({
          NODE_ENV: 'production',
          USER_JWT_ACCESS_SECRET: 'change_me_access_secret_min_32_chars_long',
          USER_JWT_REFRESH_SECRET: 'change_me_refresh_secret_min_32_chars_long',
        }),
      /Production requires custom/
    );

    assert.throws(
      () =>
        getOtpHmacSecret({
          NODE_ENV: 'production',
          OTP_HMAC_SECRET: 'change_me_otp_hmac_secret_min_32_chars_long',
        }),
      /Production requires a custom OTP_HMAC_SECRET/
    );
  });

  it('auto-detects SMTP vs console transport, derives TLS on port 465, and requires SMTP_HOST in production', () => {
    const devConfig = getEmailConfig({ NODE_ENV: 'development' });
    assert.equal(devConfig.transport, 'console');

    const smtp587 = getEmailConfig({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' });
    assert.equal(smtp587.transport, 'smtp');
    assert.equal(smtp587.smtp.secure, false);

    const smtp465 = getEmailConfig({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' });
    assert.equal(smtp465.transport, 'smtp');
    assert.equal(smtp465.smtp.secure, true);

    assert.throws(
      () => getEmailConfig({ NODE_ENV: 'production', SMTP_HOST: '' }),
      /SMTP_HOST is required in production/
    );
  });
});
