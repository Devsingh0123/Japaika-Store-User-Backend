import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getIndianFinancialYear,
  amountToWords,
  sanitizeInvoiceFilename,
  buildInvoiceData,
  renderInvoicePdfBuffer,
} from '../../services/invoice.service.js';

describe('invoice.service unit tests', () => {
  it('computes Indian Financial Year accurately across March 31 / April 1 IST boundary', () => {
    // 2026-11-27 UTC -> FY 26-27
    assert.equal(getIndianFinancialYear(new Date('2026-11-27T10:00:00.000Z')), '26-27');
    // 2027-03-31 18:00:00 UTC = 2027-03-31 23:30:00 IST -> still FY 26-27
    assert.equal(getIndianFinancialYear(new Date('2027-03-31T18:00:00.000Z')), '26-27');
    // 2027-03-31 19:00:00 UTC = 2027-04-01 00:30:00 IST -> new FY 27-28
    assert.equal(getIndianFinancialYear(new Date('2027-03-31T19:00:00.000Z')), '27-28');
  });

  it('converts INR and USD minor unit amounts into words cleanly', () => {
    assert.equal(
      amountToWords(1620000, 'INR'),
      'Indian Rupees Sixteen Thousand Two Hundred Only'
    );
    assert.equal(
      amountToWords(125050, 'INR'),
      'Indian Rupees One Thousand Two Hundred Fifty and Fifty Paise Only'
    );
    assert.equal(
      amountToWords(12345600, 'INR'),
      'Indian Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only'
    );
    assert.equal(amountToWords(9500, 'USD'), 'US Dollars Ninety Five Only');
    assert.equal(amountToWords(101, 'USD'), 'US Dollar One and One Cent Only');
  });

  it('sanitizes independent sequential invoice numbers into safe PDF filenames', () => {
    assert.equal(sanitizeInvoiceFilename('JPK/26-27/00001'), 'JPK-26-27-00001.pdf');
    assert.equal(sanitizeInvoiceFilename('JPK/27-28/00142'), 'JPK-27-28-00142.pdf');
  });

  it('builds an IN intra-state GST Tax Invoice with CGST/SGST split, proportional coupon discount, and HSN summary', async () => {
    const order = {
      orderNumber: 'JPK-20261127-AA11BB',
      invoiceNumber: 'JPK/26-27/00001',
      invoiceIssuedAt: new Date('2026-11-27T10:15:00.000Z'),
      created_at: new Date('2026-11-27T10:10:00.000Z'),
      status: 'confirmed',
      country: 'IN',
      currency: 'INR',
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      razorpayOrderId: 'order_test_1',
      razorpayPaymentId: 'pay_test_1',
      paidAt: new Date('2026-11-27T10:15:00.000Z'),
      subtotalAmount: '2000.00',
      discountAmount: '200.00',
      shippingAmount: '0.00',
      taxAmount: '69.74',
      grandTotalAmount: '1800.00',
      couponCode: 'FEST10',
      shippingAddress: {
        fullName: 'Ananya Sharma',
        phone: '+919876543210',
        addressLine1: 'Flat 402, Lotus Residency',
        city: 'Bengaluru',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        postalCode: '560038',
        country: 'IN',
      },
      user: { email: 'ananya@example.com' },
      items: [
        {
          productName: 'Yellow Sapphire',
          variantTitle: '5 Ratti',
          sku: 'PUKH-5R',
          hsnCode: '7103',
          gstRate: '3.00',
          quantity: 1,
          unitPrice: '1200.00',
          unitEffectivePrice: '1200.00',
          lineTotal: '1200.00',
          taxAmount: '31.46',
        },
        {
          productName: 'Tulsi Mala',
          variantTitle: '108 Beads',
          sku: 'TULSI-108',
          hsnCode: '7117',
          gstRate: '5.00',
          quantity: 1,
          unitPrice: '800.00',
          unitEffectivePrice: '800.00',
          lineTotal: '800.00',
          taxAmount: '34.29', // Odd paise to verify cgst + sgst === taxAmount
        },
      ],
    };

    const seller = {
      legalName: 'Japaika Spiritual Pvt Ltd',
      gstin: '29ABCDE1234F1Z5',
      addressLine1: '100 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'IN',
      email: 'support@japaika.com',
      phone: '+918012345678',
    };

    const invoice = buildInvoiceData(order, seller);

    assert.equal(invoice.invoiceNumber, 'JPK/26-27/00001');
    assert.notEqual(invoice.invoiceNumber, invoice.orderNumber);
    assert.equal(invoice.invoiceType, 'TAX_INVOICE');
    assert.equal(invoice.taxRegime, 'gst_intra_state');
    assert.equal(invoice.hsnSummary.length, 2);

    // Verify odd-paise split on item 2: 34.29 -> CGST 17.14 + SGST 17.15 = 34.29
    assert.equal(invoice.items[1].cgstAmount, '17.14');
    assert.equal(invoice.items[1].sgstAmount, '17.15');
    assert.equal(invoice.items[1].igstAmount, '0.00');
    assert.equal(invoice.items[0].discountAmount, '120.00');
    assert.equal(invoice.items[1].discountAmount, '80.00');
    assert.equal(invoice.totals.discountAmount, '200.00');
    assert.equal(invoice.totals.igstAmount, '0.00');

    // Render A4 PDF and verify valid PDF header
    const pdfBuf = await renderInvoicePdfBuffer(invoice);
    assert.ok(Buffer.isBuffer(pdfBuf));
    assert.ok(pdfBuf.length > 1000);
    assert.equal(pdfBuf.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  it('builds an IN inter-state IGST invoice and a US zero-rated Export Invoice + PDF', async () => {
    const interStateOrder = {
      orderNumber: 'JPK-20261127-CC22DD',
      invoiceNumber: 'JPK/26-27/00002',
      status: 'confirmed',
      country: 'IN',
      currency: 'INR',
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      paidAt: new Date('2026-11-27T11:00:00.000Z'),
      subtotalAmount: '1000.00',
      discountAmount: '0.00',
      shippingAmount: '0.00',
      taxAmount: '29.13',
      grandTotalAmount: '1000.00',
      shippingAddress: { fullName: 'Rajesh', state: 'Maharashtra', country: 'IN' },
      items: [
        {
          productName: 'Rudraksha',
          sku: 'RUD-5M',
          hsnCode: '7117',
          gstRate: '3.00',
          quantity: 1,
          unitPrice: '1000.00',
          unitEffectivePrice: '1000.00',
          lineTotal: '1000.00',
          taxAmount: '29.13',
        },
      ],
    };

    const interInvoice = buildInvoiceData(interStateOrder, {
      legalName: 'Japaika',
      gstin: null,
      state: 'Karnataka',
      country: 'IN',
    });
    assert.equal(interInvoice.invoiceType, 'BILL_OF_SUPPLY');
    assert.equal(interInvoice.taxRegime, 'gst_inter_state');
    assert.equal(interInvoice.totals.igstAmount, '29.13');
    assert.equal(interInvoice.totals.cgstAmount, '0.00');
    assert.equal(interInvoice.totals.sgstAmount, '0.00');

    const usOrder = {
      orderNumber: 'JPK-20261127-EE33FF',
      invoiceNumber: 'JPK/26-27/00003',
      status: 'confirmed',
      country: 'US',
      currency: 'USD',
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      paidAt: new Date('2026-11-27T12:00:00.000Z'),
      subtotalAmount: '80.00',
      discountAmount: '0.00',
      shippingAmount: '15.00',
      taxAmount: '0.00',
      grandTotalAmount: '95.00',
      shippingAddress: {
        fullName: 'Ananya Sharma',
        city: 'San Francisco',
        state: 'California',
        postalCode: '94107',
        country: 'US',
      },
      items: [
        {
          productName: 'Tulsi Mala',
          sku: 'TULSI-1',
          gstRate: '5.00',
          quantity: 2,
          unitPrice: '40.00',
          unitEffectivePrice: '40.00',
          lineTotal: '80.00',
          taxAmount: '0.00',
        },
      ],
    };

    const usInvoice = buildInvoiceData(usOrder);
    assert.equal(usInvoice.invoiceType, 'EXPORT_INVOICE');
    assert.equal(usInvoice.taxRegime, 'export_zero_rated');
    assert.equal(usInvoice.gstInclusive, false);
    assert.equal(usInvoice.hsnSummary.length, 0);
    assert.equal(usInvoice.totals.taxAmount, '0.00');
    assert.equal(usInvoice.totals.grandTotalAmount, '95.00');
    assert.equal(usInvoice.totals.amountInWords, 'US Dollars Ninety Five Only');

    const usPdf = await renderInvoicePdfBuffer(usInvoice);
    assert.equal(usPdf.subarray(0, 5).toString('ascii'), '%PDF-');
  });
});
