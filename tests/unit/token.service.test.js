import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { parseEnv } from '../../config/env.js';
import {
  parseDurationToMs,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../services/token.service.js';

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
    const token = signAccessToken(user);
    const payload = verifyAccessToken(token);

    assert.equal(payload.sub, user.id);
    assert.equal(payload.email, user.email);
    assert.equal(payload.subType, 'customer');
    assert.equal(payload.tokenType, 'access');
    assert.equal(payload.iss, 'japaika-user-backend');
    assert.equal(payload.aud, 'japaika-user');
  });

  it('rejects refresh tokens or tokens signed with wrong secret when verifying access tokens', () => {
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

    const refreshToken = signRefreshToken({ userId, tokenId, familyId });
    const payload = verifyRefreshToken(refreshToken);

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
    const h2 = hashToken('sample-token-value');
    const h3 = hashToken('different-token-value');

    assert.equal(h1.length, 64);
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
  });
});

describe('config/env production safety validation', () => {
  it('rejects identical access and refresh secrets', () => {
    const sameSecret = 'a_shared_secret_value_that_is_over_32_chars_long';
    assert.throws(
      () =>
        parseEnv({
          USER_JWT_ACCESS_SECRET: sameSecret,
          USER_JWT_REFRESH_SECRET: sameSecret,
        }),
      /must differ/
    );
  });

  it('rejects console email transport and default secrets in production', () => {
    assert.throws(
      () =>
        parseEnv({
          NODE_ENV: 'production',
          EMAIL_TRANSPORT: 'console',
        }),
      /EMAIL_TRANSPORT must be "smtp" in production/
    );
  });
});
