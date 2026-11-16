export const SOURCE_TYPES = ['price_sheet', 'tally', 'shopify', 'bank_statement', 'pdf_invoice'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type RowKind = 'invoice_line' | 'price_quote' | 'payment' | 'sale';

/** Source-agnostic row emitted by every parser; values are still un-normalised text/numbers. */
export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  kind: RowKind;
  vendorName?: string;
  vendorTaxId?: string;
  productName?: string;
  sku?: string;
  quantity?: unknown;
  unit?: string;
  unitPrice?: unknown;
  amount?: unknown;
  currency?: string;
  date?: unknown;
  reference?: string;
  description?: string;
}

export interface RowIssue {
  rowNumber: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: RowIssue[];
  /** Rows intentionally ignored (e.g. bank credits, unsupported voucher types). */
  skipped: number;
}

export interface ParseOptions {
  filename: string;
}

export type Parser = (buffer: Buffer, options: ParseOptions) => Promise<ParseResult>;

/** Allowed lowercase file extensions per source. */
export const ALLOWED_EXTENSIONS: Record<SourceType, string[]> = {
  price_sheet: ['.csv', '.xlsx'],
  tally: ['.xml'],
  shopify: ['.csv', '.json'],
  bank_statement: ['.csv', '.xlsx'],
  pdf_invoice: ['.pdf'],
};
