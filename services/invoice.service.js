import PDFDocument from 'pdfkit';
import {
  sequelize,
  User,
  Order,
  OrderItem,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from '../models/index.js';
import { parseJsonField } from './catalog.service.js';
import { toMinorUnits, formatMinorUnits } from './coupon.service.js';
import { AppError } from '../utils/http.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigitWords(n) {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return one ? `${TENS[ten]} ${ONES[one]}` : TENS[ten];
}

function threeDigitWords(n) {
  const hundred = Math.floor(n / 100);
  const rem = n % 100;
  const parts = [];
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rem) parts.push(twoDigitWords(rem));
  return parts.join(' ');
}

function integerToIndianWords(num) {
  if (num === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;

  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (num) parts.push(threeDigitWords(num));
  return parts.join(' ');
}

function integerToInternationalWords(num) {
  if (num === 0) return 'Zero';
  const scales = ['', 'Thousand', 'Million', 'Billion'];
  const parts = [];
  let scaleIdx = 0;
  let remaining = num;

  while (remaining > 0 && scaleIdx < scales.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const label = scales[scaleIdx]
        ? `${threeDigitWords(chunk)} ${scales[scaleIdx]}`
        : threeDigitWords(chunk);
      parts.unshift(label);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx += 1;
  }

  return parts.join(' ');
}

export function amountToWords(amountMinor, currency = 'INR') {
  const safeMinor = Math.max(0, Math.round(Number(amountMinor || 0)));
  const whole = Math.floor(safeMinor / 100);
  const fraction = safeMinor % 100;
  const curr = String(currency || 'INR').toUpperCase();

  if (curr === 'USD') {
    const majorLabel = whole === 1 ? 'US Dollar' : 'US Dollars';
    const minorLabel = fraction === 1 ? 'Cent' : 'Cents';
    const wholeWords = integerToInternationalWords(whole);
    return fraction > 0
      ? `${majorLabel} ${wholeWords} and ${twoDigitWords(fraction)} ${minorLabel} Only`
      : `${majorLabel} ${wholeWords} Only`;
  }

  const majorLabel = whole === 1 ? 'Indian Rupee' : 'Indian Rupees';
  const minorLabel = fraction === 1 ? 'Paise' : 'Paise';
  const wholeWords = integerToIndianWords(whole);
  return fraction > 0
    ? `${majorLabel} ${wholeWords} and ${twoDigitWords(fraction)} ${minorLabel} Only`
    : `${majorLabel} ${wholeWords} Only`;
}

export function getIndianFinancialYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth() + 1; // 1..12
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

export function getInvoicePrefix(raw = process.env) {
  const cleaned = String(raw.INVOICE_PREFIX || 'JPK')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  return cleaned || 'JPK';
}

export function getSellerInvoiceProfile(raw = process.env) {
  const trimOrNull = (val) => {
    const s = String(val || '').trim();
    return s || null;
  };
  const gstin = trimOrNull(raw.SELLER_GSTIN)?.toUpperCase() || null;

  return {
    legalName: trimOrNull(raw.SELLER_LEGAL_NAME) || 'Japaika',
    gstin,
    addressLine1: trimOrNull(raw.SELLER_ADDRESS_LINE1),
    addressLine2: trimOrNull(raw.SELLER_ADDRESS_LINE2),
    city: trimOrNull(raw.SELLER_CITY),
    state: trimOrNull(raw.SELLER_STATE),
    postalCode: trimOrNull(raw.SELLER_POSTAL_CODE),
    country: (trimOrNull(raw.SELLER_COUNTRY) || 'IN').toUpperCase(),
    email: trimOrNull(raw.SELLER_EMAIL) || 'support@japaika.example',
    phone: trimOrNull(raw.SELLER_PHONE),
  };
}

export function isOrderInvoiceEligible(order) {
  if (!order) return false;
  if (order.paidAt) return true;
  return [
    PAYMENT_STATUSES.PAID,
    PAYMENT_STATUSES.REFUND_PENDING,
    PAYMENT_STATUSES.REFUNDED,
  ].includes(order.paymentStatus);
}

export function sanitizeInvoiceFilename(invoiceNumber) {
  const safe = String(invoiceNumber || 'invoice')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${safe || 'invoice'}.pdf`;
}

export async function assignInvoiceNumberForOrder(
  order,
  { issuedAt = new Date(), transaction } = {}
) {
  if (order.invoiceNumber) {
    return {
      invoiceNumber: order.invoiceNumber,
      invoiceIssuedAt: order.invoiceIssuedAt || order.paidAt || issuedAt,
    };
  }

  const timestamp = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  const fy = getIndianFinancialYear(timestamp);
  const prefix = getInvoicePrefix();

  await sequelize.query(
    'INSERT IGNORE INTO invoice_sequences (financial_year, last_number, updated_at) VALUES (?, 0, ?)',
    { replacements: [fy, timestamp], transaction }
  );

  const [rows] = await sequelize.query(
    'SELECT last_number FROM invoice_sequences WHERE financial_year = ? FOR UPDATE',
    { replacements: [fy], transaction }
  );

  const nextNumber = Number(rows[0]?.last_number || 0) + 1;

  await sequelize.query(
    'UPDATE invoice_sequences SET last_number = ?, updated_at = ? WHERE financial_year = ?',
    { replacements: [nextNumber, timestamp, fy], transaction }
  );

  const padded = String(nextNumber).padStart(5, '0');
  const invoiceNumber = `${prefix}/${fy}/${padded}`;

  await order.update(
    {
      invoiceNumber,
      invoiceIssuedAt: timestamp,
    },
    { transaction }
  );

  return { invoiceNumber, invoiceIssuedAt: timestamp };
}

function normalizeStateName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function buildInvoiceData(order, seller = getSellerInvoiceProfile()) {
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const shippingAddr = parseJsonField(order.shippingAddress, {}) || {};
  const isIndia = String(order.country || 'IN').toUpperCase() === 'IN';

  const subtotalMinor = toMinorUnits(order.subtotalAmount);
  const totalDiscountMinor = toMinorUnits(order.discountAmount);
  const shippingMinor = toMinorUnits(order.shippingAmount);
  const grandTotalMinor = toMinorUnits(order.grandTotalAmount);

  const sellerStateNorm = normalizeStateName(seller.state);
  const buyerStateNorm = normalizeStateName(shippingAddr.state);
  const isIntraState = isIndia && Boolean(sellerStateNorm) && sellerStateNorm === buyerStateNorm;

  let taxRegime = 'export_zero_rated';
  if (isIndia) {
    taxRegime = isIntraState ? 'gst_intra_state' : 'gst_inter_state';
  }

  let invoiceType = 'EXPORT_INVOICE';
  if (isIndia) {
    invoiceType = seller.gstin ? 'TAX_INVOICE' : 'BILL_OF_SUPPLY';
  }

  let invoiceStatus = 'issued';
  if (order.paymentStatus === PAYMENT_STATUSES.REFUNDED) {
    invoiceStatus = 'refunded';
  } else if (order.status === ORDER_STATUSES.CANCELLED) {
    invoiceStatus = 'cancelled';
  }

  // Distribute order-level coupon discount across line items without rounding drift
  let allocatedDiscountMinor = 0;
  let totalTaxableMinor = 0;
  let totalCgstMinor = 0;
  let totalSgstMinor = 0;
  let totalIgstMinor = 0;
  let totalTaxMinor = 0;

  const hsnGroups = new Map();

  const items = rawItems.map((item, idx) => {
    const grossLineTotalMinor = toMinorUnits(item.lineTotal);
    const isLast = idx === rawItems.length - 1;

    let itemDiscountMinor = 0;
    if (totalDiscountMinor > 0 && subtotalMinor > 0) {
      if (isLast) {
        itemDiscountMinor = Math.max(0, totalDiscountMinor - allocatedDiscountMinor);
      } else {
        itemDiscountMinor = Math.round((grossLineTotalMinor * totalDiscountMinor) / subtotalMinor);
        itemDiscountMinor = Math.min(itemDiscountMinor, totalDiscountMinor - allocatedDiscountMinor);
      }
      allocatedDiscountMinor += itemDiscountMinor;
    }

    const netLineTotalMinor = Math.max(0, grossLineTotalMinor - itemDiscountMinor);
    const itemTaxMinor = isIndia ? Math.min(netLineTotalMinor, toMinorUnits(item.taxAmount)) : 0;
    const taxableValueMinor = netLineTotalMinor - itemTaxMinor;
    const gstRateMinor = isIndia ? toMinorUnits(item.gstRate) : 0;

    let cgstRateMinor = 0;
    let sgstRateMinor = 0;
    let igstRateMinor = 0;
    let cgstMinor = 0;
    let sgstMinor = 0;
    let igstMinor = 0;

    if (isIndia && itemTaxMinor > 0) {
      if (isIntraState) {
        cgstRateMinor = Math.round(gstRateMinor / 2);
        sgstRateMinor = gstRateMinor - cgstRateMinor;
        cgstMinor = Math.floor(itemTaxMinor / 2);
        sgstMinor = itemTaxMinor - cgstMinor;
      } else {
        igstRateMinor = gstRateMinor;
        igstMinor = itemTaxMinor;
      }
    }

    totalTaxableMinor += taxableValueMinor;
    totalCgstMinor += cgstMinor;
    totalSgstMinor += sgstMinor;
    totalIgstMinor += igstMinor;
    totalTaxMinor += itemTaxMinor;

    if (isIndia) {
      const hsnKey = `${item.hsnCode || 'N/A'}|${formatMinorUnits(gstRateMinor)}`;
      const existingGroup = hsnGroups.get(hsnKey) || {
        hsnCode: item.hsnCode || 'N/A',
        gstRate: formatMinorUnits(gstRateMinor),
        taxableValueMinor: 0,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        totalTaxMinor: 0,
      };
      existingGroup.taxableValueMinor += taxableValueMinor;
      existingGroup.cgstMinor += cgstMinor;
      existingGroup.sgstMinor += sgstMinor;
      existingGroup.igstMinor += igstMinor;
      existingGroup.totalTaxMinor += itemTaxMinor;
      hsnGroups.set(hsnKey, existingGroup);
    }

    return {
      srNo: idx + 1,
      productName: item.productName,
      variantTitle: item.variantTitle ?? null,
      sku: item.sku,
      hsnCode: item.hsnCode ?? null,
      quantity: Number(item.quantity),
      unitPrice: formatMinorUnits(toMinorUnits(item.unitPrice)),
      unitEffectivePrice: formatMinorUnits(toMinorUnits(item.unitEffectivePrice)),
      grossLineTotal: formatMinorUnits(grossLineTotalMinor),
      discountAmount: formatMinorUnits(itemDiscountMinor),
      taxableValue: formatMinorUnits(taxableValueMinor),
      gstRate: formatMinorUnits(gstRateMinor),
      cgstRate: formatMinorUnits(cgstRateMinor),
      cgstAmount: formatMinorUnits(cgstMinor),
      sgstRate: formatMinorUnits(sgstRateMinor),
      sgstAmount: formatMinorUnits(sgstMinor),
      igstRate: formatMinorUnits(igstRateMinor),
      igstAmount: formatMinorUnits(igstMinor),
      taxAmount: formatMinorUnits(itemTaxMinor),
      netLineTotal: formatMinorUnits(netLineTotalMinor),
    };
  });

  const hsnSummary = isIndia
    ? [...hsnGroups.values()].map((g) => ({
        hsnCode: g.hsnCode,
        gstRate: g.gstRate,
        taxableValue: formatMinorUnits(g.taxableValueMinor),
        cgstAmount: formatMinorUnits(g.cgstMinor),
        sgstAmount: formatMinorUnits(g.sgstMinor),
        igstAmount: formatMinorUnits(g.igstMinor),
        totalTaxAmount: formatMinorUnits(g.totalTaxMinor),
      }))
    : [];

  const issuedAtRaw = order.invoiceIssuedAt || order.paidAt || order.created_at || order.createdAt;
  const orderDateRaw = order.created_at || order.createdAt;

  const notes = isIndia
    ? [
        'All prices are inclusive of applicable GST.',
        'This is a computer-generated invoice and does not require a physical signature.',
      ]
    : [
        'Export supply — 0% Indian GST applicable.',
        'This is a computer-generated commercial invoice and does not require a physical signature.',
      ];

  return {
    invoiceNumber: order.invoiceNumber,
    invoiceType,
    invoiceStatus,
    issuedAt: issuedAtRaw ? new Date(issuedAtRaw).toISOString() : null,
    orderNumber: order.orderNumber,
    orderDate: orderDateRaw ? new Date(orderDateRaw).toISOString() : null,
    orderStatus: order.status,
    country: order.country,
    currency: order.currency,
    taxRegime,
    gstInclusive: isIndia,
    placeOfSupply: shippingAddr.state || shippingAddr.country || order.country,
    seller,
    buyer: {
      email: order.user?.email ?? null,
      fullName: shippingAddr.fullName ?? null,
      phone: shippingAddr.phone ?? null,
      addressLine1: shippingAddr.addressLine1 ?? null,
      addressLine2: shippingAddr.addressLine2 ?? null,
      landmark: shippingAddr.landmark ?? null,
      city: shippingAddr.city ?? null,
      district: shippingAddr.district ?? null,
      state: shippingAddr.state ?? null,
      postalCode: shippingAddr.postalCode ?? null,
      country: shippingAddr.country ?? order.country,
    },
    items,
    hsnSummary,
    totals: {
      subtotalAmount: formatMinorUnits(subtotalMinor),
      discountAmount: formatMinorUnits(totalDiscountMinor),
      couponCode: order.couponCode ?? null,
      taxableAmount: formatMinorUnits(totalTaxableMinor),
      cgstAmount: formatMinorUnits(totalCgstMinor),
      sgstAmount: formatMinorUnits(totalSgstMinor),
      igstAmount: formatMinorUnits(totalIgstMinor),
      taxAmount: formatMinorUnits(totalTaxMinor),
      shippingAmount: formatMinorUnits(shippingMinor),
      grandTotalAmount: formatMinorUnits(grandTotalMinor),
      amountInWords: amountToWords(grandTotalMinor, order.currency),
    },
    payment: {
      method: order.paymentMethod,
      status: order.paymentStatus,
      razorpayOrderId: order.razorpayOrderId ?? null,
      razorpayPaymentId: order.razorpayPaymentId ?? null,
      paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
      refundAmount:
        order.refundAmount !== null && order.refundAmount !== undefined
          ? formatMinorUnits(toMinorUnits(order.refundAmount))
          : null,
      razorpayRefundId: order.razorpayRefundId ?? null,
      refundedAt: order.refundedAt ? new Date(order.refundedAt).toISOString() : null,
    },
    notes,
  };
}

export async function getCustomerOrderInvoice(userId, orderNumber) {
  const normalized = String(orderNumber).trim().toUpperCase();

  let order = await Order.findOne({
    where: {
      orderNumber: normalized,
      userId,
    },
    include: [
      { model: OrderItem, as: 'items' },
      { model: User, as: 'user', attributes: ['id', 'email'] },
    ],
  });

  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }

  if (!isOrderInvoiceEligible(order)) {
    throw new AppError(
      409,
      'INVOICE_UNAVAILABLE',
      'Invoice is only available once payment has been confirmed for this order.'
    );
  }

  // Self-healing assignment if order was marked paid externally without an invoice_number
  if (!order.invoiceNumber) {
    await sequelize.transaction(async (transaction) => {
      const lockedOrder = await Order.findOne({
        where: { id: order.id, userId },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      if (lockedOrder && !lockedOrder.invoiceNumber) {
        await assignInvoiceNumberForOrder(lockedOrder, {
          issuedAt: lockedOrder.paidAt || new Date(),
          transaction,
        });
      }
    });

    order = await Order.findByPk(order.id, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: User, as: 'user', attributes: ['id', 'email'] },
      ],
    });
  }

  return {
    invoice: buildInvoiceData(order),
  };
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

function formatAddressLines(addr) {
  if (!addr) return [];
  const lines = [];
  if (addr.addressLine1) lines.push(addr.addressLine1);
  if (addr.addressLine2) lines.push(addr.addressLine2);
  if (addr.landmark) lines.push(`Landmark: ${addr.landmark}`);
  const cityParts = [addr.city, addr.district, addr.state].filter(Boolean);
  const cityLine = cityParts.join(', ');
  const postalSuffix = addr.postalCode ? ` - ${addr.postalCode}` : '';
  if (cityLine || postalSuffix) {
    lines.push(`${cityLine}${postalSuffix}`.trim());
  }
  if (addr.country) lines.push(addr.country === 'IN' ? 'India' : addr.country === 'US' ? 'United States' : addr.country);
  return lines;
}

export function renderInvoicePdfBuffer(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageLeft = 40;
    const contentWidth = 515;
    const curr = invoice.currency;

    const titleMap = {
      TAX_INVOICE: 'TAX INVOICE',
      BILL_OF_SUPPLY: 'ORDER INVOICE',
      EXPORT_INVOICE: 'COMMERCIAL / EXPORT INVOICE',
    };
    const docTitle = titleMap[invoice.invoiceType] || 'ORDER INVOICE';

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text(invoice.seller.legalName, pageLeft, 40);
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#1f2937')
      .text(docTitle, pageLeft, 42, { width: contentWidth, align: 'right' });

    if (invoice.invoiceStatus !== 'issued') {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#b91c1c')
        .text(`STATUS: ${invoice.invoiceStatus.toUpperCase()}`, pageLeft, 60, {
          width: contentWidth,
          align: 'right',
        });
    }

    // Metadata line
    let y = 76;
    doc.moveTo(pageLeft, y).lineTo(pageLeft + contentWidth, y).strokeColor('#d1d5db').lineWidth(1).stroke();
    y += 10;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, pageLeft, y);
    doc.text(`Invoice Date: ${formatDateShort(invoice.issuedAt)}`, pageLeft + 260, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
    doc.text(`Order No: ${invoice.orderNumber}`, pageLeft, y);
    doc.text(`Order Date: ${formatDateShort(invoice.orderDate)}`, pageLeft + 260, y);
    y += 14;
    doc.text(`Place of Supply: ${invoice.placeOfSupply}`, pageLeft, y);
    doc.text(`Currency: ${curr}`, pageLeft + 260, y);
    y += 18;

    doc.moveTo(pageLeft, y).lineTo(pageLeft + contentWidth, y).strokeColor('#e5e7eb').lineWidth(0.75).stroke();
    y += 12;

    // Two-column Seller & Buyer blocks
    const colWidth = 245;
    const rightColX = pageLeft + 270;
    const blockStartY = y;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('SOLD BY', pageLeft, blockStartY);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('BILL TO / SHIP TO', rightColX, blockStartY);

    let sellerY = blockStartY + 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f2937').text(invoice.seller.legalName, pageLeft, sellerY, { width: colWidth });
    sellerY = doc.y + 2;
    doc.font('Helvetica').fontSize(8.5).fillColor('#4b5563');
    for (const line of formatAddressLines(invoice.seller)) {
      doc.text(line, pageLeft, sellerY, { width: colWidth });
      sellerY = doc.y + 1;
    }
    if (invoice.seller.gstin) {
      doc.text(`GSTIN: ${invoice.seller.gstin}`, pageLeft, sellerY, { width: colWidth });
      sellerY = doc.y + 1;
    }
    if (invoice.seller.email) {
      doc.text(`Email: ${invoice.seller.email}`, pageLeft, sellerY, { width: colWidth });
      sellerY = doc.y + 1;
    }
    if (invoice.seller.phone) {
      doc.text(`Phone: ${invoice.seller.phone}`, pageLeft, sellerY, { width: colWidth });
      sellerY = doc.y + 1;
    }

    let buyerY = blockStartY + 14;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#1f2937')
      .text(invoice.buyer.fullName || 'Customer', rightColX, buyerY, { width: colWidth });
    buyerY = doc.y + 2;
    doc.font('Helvetica').fontSize(8.5).fillColor('#4b5563');
    for (const line of formatAddressLines(invoice.buyer)) {
      doc.text(line, rightColX, buyerY, { width: colWidth });
      buyerY = doc.y + 1;
    }
    if (invoice.buyer.phone) {
      doc.text(`Phone: ${invoice.buyer.phone}`, rightColX, buyerY, { width: colWidth });
      buyerY = doc.y + 1;
    }
    if (invoice.buyer.email) {
      doc.text(`Email: ${invoice.buyer.email}`, rightColX, buyerY, { width: colWidth });
      buyerY = doc.y + 1;
    }

    y = Math.max(sellerY, buyerY) + 16;

    // Itemized Table Header
    const drawTableHeader = (topY) => {
      doc.rect(pageLeft, topY, contentWidth, 20).fill('#f3f4f6');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827');
      doc.text('#', pageLeft + 4, topY + 6, { width: 18 });
      doc.text('Item Description', pageLeft + 24, topY + 6, { width: 175 });
      doc.text('HSN', pageLeft + 202, topY + 6, { width: 42 });
      doc.text('Qty', pageLeft + 246, topY + 6, { width: 26, align: 'right' });
      doc.text('Rate', pageLeft + 275, topY + 6, { width: 55, align: 'right' });
      doc.text('Taxable', pageLeft + 333, topY + 6, { width: 60, align: 'right' });
      doc.text(invoice.gstInclusive ? 'GST' : 'Tax', pageLeft + 396, topY + 6, {
        width: 52,
        align: 'right',
      });
      doc.text('Total', pageLeft + 450, topY + 6, { width: 61, align: 'right' });
      return topY + 24;
    };

    y = drawTableHeader(y);

    for (const item of invoice.items) {
      if (y > 720) {
        doc.addPage();
        y = drawTableHeader(40);
      }

      const itemLabel = item.variantTitle
        ? `${item.productName} (${item.variantTitle})\nSKU: ${item.sku}`
        : `${item.productName}\nSKU: ${item.sku}`;

      const startY = y;
      doc.font('Helvetica').fontSize(8).fillColor('#1f2937');
      doc.text(String(item.srNo), pageLeft + 4, startY, { width: 18 });
      doc.text(itemLabel, pageLeft + 24, startY, { width: 175 });
      const descBottomY = doc.y;

      doc.text(item.hsnCode || '—', pageLeft + 202, startY, { width: 42 });
      doc.text(String(item.quantity), pageLeft + 246, startY, { width: 26, align: 'right' });
      doc.text(item.unitEffectivePrice, pageLeft + 275, startY, { width: 55, align: 'right' });
      doc.text(item.taxableValue, pageLeft + 333, startY, { width: 60, align: 'right' });
      doc.text(
        invoice.gstInclusive ? `${item.taxAmount}\n(${item.gstRate}%)` : '0.00',
        pageLeft + 396,
        startY,
        { width: 52, align: 'right' }
      );
      const taxBottomY = doc.y;
      doc.font('Helvetica-Bold').text(item.netLineTotal, pageLeft + 450, startY, {
        width: 61,
        align: 'right',
      });

      y = Math.max(descBottomY, taxBottomY) + 6;
      doc.moveTo(pageLeft, y).lineTo(pageLeft + contentWidth, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      y += 6;
    }

    // HSN Summary (for IN invoices)
    if (invoice.gstInclusive && invoice.hsnSummary.length > 0) {
      if (y > 680) {
        doc.addPage();
        y = 40;
      }
      y += 6;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827').text('HSN / Tax Summary', pageLeft, y);
      y += 14;

      doc.rect(pageLeft, y, contentWidth, 18).fill('#f9fafb');
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#374151');
      doc.text('HSN', pageLeft + 6, y + 5, { width: 70 });
      doc.text('GST %', pageLeft + 80, y + 5, { width: 50, align: 'right' });
      doc.text('Taxable Value', pageLeft + 140, y + 5, { width: 90, align: 'right' });
      doc.text('CGST', pageLeft + 235, y + 5, { width: 65, align: 'right' });
      doc.text('SGST', pageLeft + 305, y + 5, { width: 65, align: 'right' });
      doc.text('IGST', pageLeft + 375, y + 5, { width: 65, align: 'right' });
      doc.text('Total Tax', pageLeft + 445, y + 5, { width: 66, align: 'right' });
      y += 22;

      doc.font('Helvetica').fontSize(8).fillColor('#1f2937');
      for (const row of invoice.hsnSummary) {
        doc.text(row.hsnCode, pageLeft + 6, y, { width: 70 });
        doc.text(`${row.gstRate}%`, pageLeft + 80, y, { width: 50, align: 'right' });
        doc.text(row.taxableValue, pageLeft + 140, y, { width: 90, align: 'right' });
        doc.text(row.cgstAmount, pageLeft + 235, y, { width: 65, align: 'right' });
        doc.text(row.sgstAmount, pageLeft + 305, y, { width: 65, align: 'right' });
        doc.text(row.igstAmount, pageLeft + 375, y, { width: 65, align: 'right' });
        doc.text(row.totalTaxAmount, pageLeft + 445, y, { width: 66, align: 'right' });
        y += 14;
      }
      y += 6;
    }

    // Totals Block
    if (y > 660) {
      doc.addPage();
      y = 40;
    }

    const totalsX = pageLeft + 300;
    const totalsLabelW = 120;
    const totalsValX = totalsX + totalsLabelW;
    const totalsValW = 95;

    const addTotalRow = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8.5).fillColor('#111827');
      doc.text(label, totalsX, y, { width: totalsLabelW, align: 'right' });
      doc.text(`${curr} ${value}`, totalsValX, y, { width: totalsValW, align: 'right' });
      y += bold ? 16 : 13;
    };

    addTotalRow('Subtotal:', invoice.totals.subtotalAmount);
    if (toMinorUnits(invoice.totals.discountAmount) > 0) {
      const discLabel = invoice.totals.couponCode
        ? `Discount (${invoice.totals.couponCode}):`
        : 'Discount:';
      addTotalRow(discLabel, `-${invoice.totals.discountAmount}`);
    }
    if (invoice.gstInclusive) {
      addTotalRow('Taxable Value:', invoice.totals.taxableAmount);
      if (invoice.taxRegime === 'gst_intra_state') {
        addTotalRow('CGST:', invoice.totals.cgstAmount);
        addTotalRow('SGST:', invoice.totals.sgstAmount);
      } else {
        addTotalRow('IGST:', invoice.totals.igstAmount);
      }
    }
    addTotalRow('Shipping:', invoice.totals.shippingAmount);
    doc.moveTo(totalsX, y).lineTo(pageLeft + contentWidth, y).strokeColor('#9ca3af').lineWidth(0.75).stroke();
    y += 5;
    addTotalRow('Grand Total:', invoice.totals.grandTotalAmount, true);

    y += 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#374151')
      .text(`Amount in Words: `, pageLeft, y, { continued: true })
      .font('Helvetica')
      .text(invoice.totals.amountInWords, { width: contentWidth });
    y = doc.y + 12;

    // Payment & Refund Info
    doc.moveTo(pageLeft, y).lineTo(pageLeft + contentWidth, y).strokeColor('#e5e7eb').lineWidth(0.75).stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827').text('Payment Information', pageLeft, y);
    y += 13;
    doc.font('Helvetica').fontSize(8).fillColor('#4b5563');
    doc.text(
      `Method: ${String(invoice.payment.method || '').toUpperCase()}   |   Status: ${String(invoice.payment.status || '').toUpperCase()}   |   Paid Date: ${formatDateShort(invoice.payment.paidAt)}`,
      pageLeft,
      y
    );
    y += 12;
    if (invoice.payment.razorpayPaymentId) {
      doc.text(`Payment Reference: ${invoice.payment.razorpayPaymentId}`, pageLeft, y);
      y += 12;
    }
    if (invoice.payment.refundAmount) {
      doc.text(
        `Refund Amount: ${curr} ${invoice.payment.refundAmount}${invoice.payment.razorpayRefundId ? `   |   Refund Ref: ${invoice.payment.razorpayRefundId}` : ''}`,
        pageLeft,
        y
      );
      y += 12;
    }

    // Notes
    y += 10;
    doc.font('Helvetica').fontSize(7.5).fillColor('#6b7280');
    for (const note of invoice.notes || []) {
      doc.text(`• ${note}`, pageLeft, y, { width: contentWidth });
      y = doc.y + 2;
    }

    doc.end();
  });
}
