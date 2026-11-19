import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  generateOtp,
  hashOtp,
  verifyOtpHash,
} from '../../services/otp.service.js';

describe('otp.service', () => {
  it('normalizes email by trimming whitespace and lowercasing', () => {
    assert.equal(normalizeEmail('  Ananya.Sharma@Example.COM  '), 'ananya.sharma@example.com');
  });

  it('generates a 6-digit numeric OTP', () => {
    for (let i = 0; i < 50; i += 1) {
      const otp = generateOtp();
      assert.match(otp, /^\d{6}$/);
      assert.ok(Number(otp) >= 100000 && Number(otp) <= 999999);
    }
  });

  it('hashes OTP deterministically using HMAC-SHA256 bound to normalized email', () => {
    const secret = 'test_otp_hmac_secret_with_at_least_32_characters';
    const hash1 = hashOtp('User@Example.com', '482913', secret);
    const hash2 = hashOtp('  user@example.com ', '482913', secret);
    const hashDifferentEmail = hashOtp('other@example.com', '482913', secret);
    const hashDifferentOtp = hashOtp('user@example.com', '482914', secret);

    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hashDifferentEmail);
    assert.notEqual(hash1, hashDifferentOtp);
  });

  it('verifies matching OTP hashes and rejects mismatches or malformed hashes', () => {
    const secret = 'test_otp_hmac_secret_with_at_least_32_characters';
    const expectedHash = hashOtp('user@example.com', '654321', secret);

    assert.equal(verifyOtpHash('USER@example.com', '654321', expectedHash, secret), true);
    assert.equal(verifyOtpHash('user@example.com', '654320', expectedHash, secret), false);
    assert.equal(verifyOtpHash('other@example.com', '654321', expectedHash, secret), false);
    assert.equal(verifyOtpHash('user@example.com', '654321', 'short', secret), false);
    assert.equal(verifyOtpHash('user@example.com', '654321', '', secret), false);
  });
});
