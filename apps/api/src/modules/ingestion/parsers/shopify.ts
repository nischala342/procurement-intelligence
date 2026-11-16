import path from 'node:path';
import { AppError } from '../../../utils/AppError';
import { pick, readTable, text } from './tabular';
import type { ParseResult, ParsedRow, Parser } from './types';

const ORDER_SYN = {
  order: ['name', 'order', 'ordernumber', 'id'],
  date: ['createdat', 'paidat', 'processedat'],
  product: ['lineitemname'],
  qty: ['lineitemquantity'],
  price: ['lineitemprice'],
  sku: ['lineitemsku'],
  vendor: ['vendor'],
  currency: ['currency', 'presentmentcurrency'],
};
const PRODUCT_SYN = {
  product: ['title'],
  vendor: ['vendor'],
  sku: ['variantsku'],
  price: ['variantprice', 'variantcompareatprice'],
  qty: ['variantinventoryqty'],
  handle: ['handle'],
};

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (v == null || v === '' ? undefined : String(v));

function fromJson(payload: unknown, result: ParseResult) {
  const root = Array.isArray(payload) ? { orders: payload } : asRecord(payload);
  const orders = Array.isArray(root.orders) ? root.orders : [];
  const products = Array.isArray(root.products) ? root.products : [];
  if (!orders.length && !products.length) {
    throw new AppError(422, 'PARSE_FAILED', 'JSON must contain an "orders" or "products" array (Shopify Admin API shape)');
  }
  let n = 0;
  for (const o of orders) {
    const order = asRecord(o);
    const items = Array.isArray(order.line_items) ? order.line_items : [];
    for (const li of items) {
      const item = asRecord(li);
      n++;
      result.rows.push({
        rowNumber: n,
        raw: { order: order.name ?? order.id, ...item },
        kind: 'sale',
        vendorName: str(item.vendor),
        productName: str(item.title ?? item.name),
        sku: str(item.sku),
        quantity: item.quantity,
        unitPrice: item.price,
        currency: str(order.currency),
        date: order.created_at,
        reference: str(order.name ?? order.id),
      });
    }
  }
  for (const p of products) {
    const product = asRecord(p);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    for (const v of variants) {
      const variant = asRecord(v);
      n++;
      result.rows.push({
        rowNumber: n,
        raw: { title: product.title, vendor: product.vendor, ...variant },
        kind: 'price_quote',
        vendorName: str(product.vendor),
        productName: str(product.title),
        sku: str(variant.sku),
        quantity: variant.inventory_quantity,
        unitPrice: variant.price,
        date: product.updated_at,
        reference: str(product.handle),
      });
    }
  }
}

/** Shopify exports: orders CSV, products CSV, or Admin-API-shaped JSON (orders/products). */
export const parseShopify: Parser = async (buffer, { filename }) => {
  const result: ParseResult = { rows: [], errors: [], skipped: 0 };

  if (path.extname(filename).toLowerCase() === '.json') {
    let payload: unknown;
    try {
      payload = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new AppError(422, 'PARSE_FAILED', 'File is not valid JSON');
    }
    fromJson(payload, result);
    return result;
  }

  let lastOrder: { reference?: string; date?: unknown; currency?: string } = {};
  for (const row of await readTable(buffer, filename)) {
    const c = row.cells;
    const isOrderCsv = 'lineitemname' in c;
    const S = isOrderCsv ? ORDER_SYN : PRODUCT_SYN;
    const productName = text(pick(c, S.product));
    if (!productName) {
      // Shopify CSV continuation rows (extra images/variants) carry no product title
      result.skipped++;
      continue;
    }
    const base: ParsedRow = {
      rowNumber: row.rowNumber,
      raw: row.raw,
      kind: isOrderCsv ? 'sale' : 'price_quote',
      vendorName: text(pick(c, S.vendor)),
      productName,
      sku: text(pick(c, S.sku)),
      quantity: pick(c, S.qty),
      unitPrice: pick(c, S.price),
    };
    if (isOrderCsv) {
      // Order-level columns only appear on the first line item of an order
      const o = ORDER_SYN;
      const ref = text(pick(c, o.order)) ?? lastOrder.reference;
      lastOrder = {
        reference: ref,
        date: pick(c, o.date) ?? lastOrder.date,
        currency: text(pick(c, o.currency)) ?? lastOrder.currency,
      };
      base.reference = lastOrder.reference;
      base.date = lastOrder.date;
      base.currency = lastOrder.currency;
    } else {
      base.reference = text(pick(c, PRODUCT_SYN.handle));
    }
    result.rows.push(base);
  }
  return result;
};
