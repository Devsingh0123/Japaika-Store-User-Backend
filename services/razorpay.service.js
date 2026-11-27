import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import {
  validatePaymentVerification,
  validateWebhookSignature,
} from 'razorpay/dist/utils/razorpay-utils.js';
import { AppError } from '../utils/http.js';

const HEX_SHA256_REGEX = /^[0-9a-f]{64}$/i;

let cachedClient = null;
let cachedKeyId = '';
let cachedKeySecret = '';

export function getRazorpayConfig(raw = process.env) {
  const keyId = (raw.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (raw.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (raw.RAZORPAY_WEBHOOK_SECRET || '').trim();

  if (!keyId || !keySecret) {
    throw new AppError(
      503,
      'PAYMENT_GATEWAY_UNCONFIGURED',
      'Razorpay payment credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured.'
    );
  }

  return {
    keyId,
    keySecret,
    webhookSecret,
  };
}

export function getRazorpayClient() {
  const { keyId, keySecret } = getRazorpayConfig();

  if (!cachedClient || cachedKeyId !== keyId || cachedKeySecret !== keySecret) {
    cachedClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    cachedKeyId = keyId;
    cachedKeySecret = keySecret;
  }

  return { client: cachedClient, keyId };
}

export function computePaymentSignature(
  { razorpayOrderId, razorpayPaymentId },
  keySecret = getRazorpayConfig().keySecret
) {
  return crypto
    .createHmac('sha256', keySecret)
    .update(`${String(razorpayOrderId).trim()}|${String(razorpayPaymentId).trim()}`)
    .digest('hex');
}

export function verifyPaymentSignature(
  { razorpayOrderId, razorpayPaymentId, razorpaySignature },
  keySecret = getRazorpayConfig().keySecret
) {
  if (
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature ||
    typeof razorpaySignature !== 'string'
  ) {
    return false;
  }

  const trimmedSig = razorpaySignature.trim();
  if (!HEX_SHA256_REGEX.test(trimmedSig)) {
    return false;
  }

  try {
    return validatePaymentVerification(
      {
        order_id: String(razorpayOrderId).trim(),
        payment_id: String(razorpayPaymentId).trim(),
      },
      trimmedSig.toLowerCase(),
      keySecret
    );
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(
  rawBody,
  signatureHeader,
  webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
) {
  const secret = (webhookSecret || '').trim();
  if (!secret) {
    throw new AppError(
      503,
      'WEBHOOK_SECRET_UNCONFIGURED',
      'RAZORPAY_WEBHOOK_SECRET is not configured.'
    );
  }

  if (!rawBody || !signatureHeader || typeof signatureHeader !== 'string') {
    return false;
  }

  const trimmedSig = signatureHeader.trim();
  if (!HEX_SHA256_REGEX.test(trimmedSig)) {
    return false;
  }

  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);

  try {
    return validateWebhookSignature(bodyStr, trimmedSig.toLowerCase(), secret);
  } catch {
    return false;
  }
}

export async function createRazorpayOrder({ amountMinor, currency, receipt, notes = {} }) {
  const { client, keyId } = getRazorpayClient();

  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) {
    throw new AppError(
      400,
      'INVALID_PAYMENT_AMOUNT',
      'Payable order total must be at least 1.00 in order currency.'
    );
  }

  let order;
  try {
    order = await client.orders.create({
      amount: amountMinor,
      currency: String(currency).toUpperCase(),
      receipt: String(receipt).slice(0, 40),
      notes,
    });
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    if (err?.statusCode || err?.error?.description) {
      throw new AppError(
        502,
        'PAYMENT_GATEWAY_ERROR',
        err?.error?.description || 'Failed to create payment order with Razorpay.'
      );
    }

    throw new AppError(
      502,
      'PAYMENT_GATEWAY_UNAVAILABLE',
      'Unable to connect to Razorpay right now. Please try again.'
    );
  }

  if (!order?.id) {
    throw new AppError(
      502,
      'PAYMENT_GATEWAY_ERROR',
      'Failed to create payment order with Razorpay.'
    );
  }

  return {
    keyId,
    razorpayOrderId: order.id,
    amountMinor: order.amount,
    currency: order.currency,
    status: order.status,
  };
}

const razorpayService = {
  getRazorpayConfig,
  getRazorpayClient,
  computePaymentSignature,
  verifyPaymentSignature,
  verifyWebhookSignature,
  createOrder: createRazorpayOrder,
};

export default razorpayService;
