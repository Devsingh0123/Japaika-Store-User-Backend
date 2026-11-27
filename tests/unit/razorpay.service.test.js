import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getRazorpayConfig,
  getRazorpayClient,
  computePaymentSignature,
  verifyPaymentSignature,
  verifyWebhookSignature,
  createRazorpayOrder,
} from '../../services/razorpay.service.js';

describe('razorpay.service unit tests (official Razorpay SDK)', () => {
  const testKeyId = 'rzp_test_unit_key_id';
  const testSecret = 'rzp_test_secret_key_for_unit_tests_123';
  const webhookSecret = 'rzp_test_webhook_secret_key_456';

  it('throws 503 PAYMENT_GATEWAY_UNCONFIGURED when RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing', () => {
    assert.throws(
      () => getRazorpayConfig({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }),
      (err) => err.statusCode === 503 && err.code === 'PAYMENT_GATEWAY_UNCONFIGURED'
    );

    const cfg = getRazorpayConfig({
      RAZORPAY_KEY_ID: testKeyId,
      RAZORPAY_KEY_SECRET: testSecret,
      RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    });
    assert.equal(cfg.keyId, testKeyId);
    assert.equal(cfg.keySecret, testSecret);
    assert.equal(cfg.webhookSecret, webhookSecret);
  });

  it('computes and verifies payment signatures via Razorpay SDK and rejects tampered payloads', () => {
    const razorpayOrderId = 'order_P1a2b3c4d5e6';
    const razorpayPaymentId = 'pay_Q9z8y7x6w5v4';

    const sig = computePaymentSignature(
      { razorpayOrderId, razorpayPaymentId },
      testSecret
    );
    assert.match(sig, /^[0-9a-f]{64}$/);

    assert.equal(
      verifyPaymentSignature(
        { razorpayOrderId, razorpayPaymentId, razorpaySignature: sig },
        testSecret
      ),
      true
    );

    // Tampered payment ID -> false
    assert.equal(
      verifyPaymentSignature(
        {
          razorpayOrderId,
          razorpayPaymentId: 'pay_TAMPERED',
          razorpaySignature: sig,
        },
        testSecret
      ),
      false
    );

    // Malformed signature -> false
    assert.equal(
      verifyPaymentSignature(
        { razorpayOrderId, razorpayPaymentId, razorpaySignature: 'not-a-hex-sig' },
        testSecret
      ),
      false
    );
  });

  it('verifies Razorpay webhook HMAC-SHA256 signatures against raw request body via SDK', () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } },
      }),
      'utf8'
    );

    const validSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    assert.equal(verifyWebhookSignature(rawBody, validSig, webhookSecret), true);
    assert.equal(
      verifyWebhookSignature(rawBody, '0'.repeat(64), webhookSecret),
      false
    );

    assert.throws(
      () => verifyWebhookSignature(rawBody, validSig, ''),
      (err) => err.statusCode === 503 && err.code === 'WEBHOOK_SECRET_UNCONFIGURED'
    );
  });

  it('creates orders through the official Razorpay SDK client and maps validation & gateway errors', async () => {
    const prevKeyId = process.env.RAZORPAY_KEY_ID;
    const prevKeySecret = process.env.RAZORPAY_KEY_SECRET;

    process.env.RAZORPAY_KEY_ID = testKeyId;
    process.env.RAZORPAY_KEY_SECRET = testSecret;

    const { client } = getRazorpayClient();
    const createOrderMock = mock.method(client.orders, 'create', async (payload) => ({
      id: 'order_sdk_mock_001',
      amount: payload.amount,
      currency: payload.currency,
      status: 'created',
    }));

    try {
      // Rejects invalid amount (< 100 minor units) before calling SDK
      await assert.rejects(
        () =>
          createRazorpayOrder({
            amountMinor: 50,
            currency: 'INR',
            receipt: 'JPK-TEST-1',
          }),
        (err) => err.statusCode === 400 && err.code === 'INVALID_PAYMENT_AMOUNT'
      );

      // Creates INR order via SDK
      const created = await createRazorpayOrder({
        amountMinor: 1620000,
        currency: 'inr',
        receipt: 'JPK-20261127-ABC123',
        notes: { orderNumber: 'JPK-20261127-ABC123' },
      });
      assert.equal(created.keyId, testKeyId);
      assert.equal(created.razorpayOrderId, 'order_sdk_mock_001');
      assert.equal(created.amountMinor, 1620000);
      assert.equal(created.currency, 'INR');
      assert.equal(created.status, 'created');

      // Maps Razorpay API errors ({ statusCode, error: { description } }) -> 502 PAYMENT_GATEWAY_ERROR
      createOrderMock.mock.mockImplementationOnce(async () => {
        throw {
          statusCode: 400,
          error: { description: 'Currency is not supported' },
        };
      });
      await assert.rejects(
        () =>
          createRazorpayOrder({
            amountMinor: 5000,
            currency: 'USD',
            receipt: 'JPK-TEST-2',
          }),
        (err) =>
          err.statusCode === 502 &&
          err.code === 'PAYMENT_GATEWAY_ERROR' &&
          err.message === 'Currency is not supported'
      );

      // Maps unexpected network failures -> 502 PAYMENT_GATEWAY_UNAVAILABLE
      createOrderMock.mock.mockImplementationOnce(async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'status')");
      });
      await assert.rejects(
        () =>
          createRazorpayOrder({
            amountMinor: 5000,
            currency: 'INR',
            receipt: 'JPK-TEST-3',
          }),
        (err) => err.statusCode === 502 && err.code === 'PAYMENT_GATEWAY_UNAVAILABLE'
      );
    } finally {
      createOrderMock.mock.restore();
      if (prevKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
      else process.env.RAZORPAY_KEY_ID = prevKeyId;
      if (prevKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
      else process.env.RAZORPAY_KEY_SECRET = prevKeySecret;
    }
  });
});
