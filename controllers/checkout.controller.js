import * as checkoutService from '../services/checkout.service.js';
import * as invoiceService from '../services/invoice.service.js';
import { sendSuccess } from '../utils/http.js';

export async function getShippingConfig(req, res) {
  const data = await checkoutService.getShippingConfig(req.validatedQuery);
  return sendSuccess(res, {
    message: 'Shipping configuration retrieved successfully.',
    data: { shipping: data },
  });
}

export async function createCheckoutOrder(req, res) {
  const data = await checkoutService.createCheckoutOrder(req.user.id, req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Checkout order created. Proceed with payment.',
    data,
  });
}

export async function verifyCheckoutPayment(req, res) {
  const data = await checkoutService.verifyCheckoutPayment(req.user.id, req.body);
  return sendSuccess(res, {
    message: 'Payment verified and order confirmed.',
    data,
  });
}

export async function handleRazorpayWebhook(req, res) {
  const signature = req.get('x-razorpay-signature');
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const data = await checkoutService.handleRazorpayWebhook(rawBody, signature);
  return sendSuccess(res, {
    message: 'Webhook processed.',
    data,
  });
}

export async function listOrders(req, res) {
  const data = await checkoutService.listCustomerOrders(req.user.id, req.validatedQuery);
  return sendSuccess(res, {
    message: 'Orders retrieved successfully.',
    data,
  });
}

export async function getOrderByNumber(req, res) {
  const data = await checkoutService.getCustomerOrderByNumber(
    req.user.id,
    req.validatedParams.orderNumber
  );
  return sendSuccess(res, {
    message: 'Order retrieved successfully.',
    data,
  });
}

export async function retryOrderPayment(req, res) {
  const data = await checkoutService.retryCustomerOrderPayment(
    req.user.id,
    req.validatedParams.orderNumber
  );
  return sendSuccess(res, {
    message: 'Payment retry initialized.',
    data,
  });
}

export async function cancelOrder(req, res) {
  const data = await checkoutService.cancelCustomerOrder(
    req.user.id,
    req.validatedParams.orderNumber,
    req.body
  );
  return sendSuccess(res, {
    message: 'Order cancelled successfully.',
    data,
  });
}

export async function getOrderInvoice(req, res) {
  const data = await invoiceService.getCustomerOrderInvoice(
    req.user.id,
    req.validatedParams.orderNumber
  );
  return sendSuccess(res, {
    message: 'Order invoice retrieved successfully.',
    data,
  });
}

export async function downloadOrderInvoicePdf(req, res) {
  const { invoice } = await invoiceService.getCustomerOrderInvoice(
    req.user.id,
    req.validatedParams.orderNumber
  );
  const pdfBuffer = await invoiceService.renderInvoicePdfBuffer(invoice);
  const filename = invoiceService.sanitizeInvoiceFilename(invoice.invoiceNumber);
  const disposition = req.validatedQuery?.disposition === 'inline' ? 'inline' : 'attachment';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(pdfBuffer);
}
