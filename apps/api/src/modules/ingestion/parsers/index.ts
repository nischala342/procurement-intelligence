import { parseBankStatement } from './bank';
import { parsePdfInvoice } from './pdf';
import { parsePriceSheet } from './priceSheet';
import { parseShopify } from './shopify';
import { parseTally } from './tally';
import type { Parser, SourceType } from './types';

export const PARSERS: Record<SourceType, Parser> = {
  price_sheet: parsePriceSheet,
  tally: parseTally,
  shopify: parseShopify,
  bank_statement: parseBankStatement,
  pdf_invoice: parsePdfInvoice,
};

export * from './types';
