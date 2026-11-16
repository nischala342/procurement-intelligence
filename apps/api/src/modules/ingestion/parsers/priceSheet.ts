import { parseAmount } from '../normalise/numbers';
import { pick, readTable, text } from './tabular';
import type { ParseResult, Parser } from './types';

const SYN = {
  vendor: ['vendor', 'vendorname', 'supplier', 'suppliername', 'party', 'partyname'],
  taxId: ['gstin', 'taxid', 'pan', 'vat', 'vatid'],
  sku: ['sku', 'itemcode', 'productcode', 'partno', 'partnumber', 'code'],
  product: ['product', 'productname', 'item', 'itemname', 'description', 'title', 'material'],
  unit: ['unit', 'uom', 'unitofmeasure'],
  price: ['unitprice', 'price', 'rate', 'cost', 'unitcost'],
  qty: ['quantity', 'qty', 'moq'],
  currency: ['currency', 'curr', 'ccy'],
  date: ['effectivedate', 'validfrom', 'pricedate', 'date'],
};

/** Supplier price lists (CSV/XLSX): one price_quote per row. */
export const parsePriceSheet: Parser = async (buffer, { filename }) => {
  const result: ParseResult = { rows: [], errors: [], skipped: 0 };
  for (const row of await readTable(buffer, filename)) {
    const c = row.cells;
    const productName = text(pick(c, SYN.product));
    const sku = text(pick(c, SYN.sku));
    if (!productName && !sku) {
      result.errors.push({ rowNumber: row.rowNumber, message: 'Missing product name and SKU' });
      continue;
    }
    const price = pick(c, SYN.price);
    if (parseAmount(price) == null) {
      result.errors.push({ rowNumber: row.rowNumber, message: 'Missing or unreadable unit price' });
      continue;
    }
    const currency = text(pick(c, SYN.currency));
    result.rows.push({
      rowNumber: row.rowNumber,
      raw: row.raw,
      kind: 'price_quote',
      vendorName: text(pick(c, SYN.vendor)),
      vendorTaxId: text(pick(c, SYN.taxId)),
      productName,
      sku,
      unit: text(pick(c, SYN.unit)),
      unitPrice: price,
      quantity: pick(c, SYN.qty),
      currency: currency ?? (typeof price === 'string' ? price : undefined),
      date: pick(c, SYN.date),
    });
  }
  return result;
};
