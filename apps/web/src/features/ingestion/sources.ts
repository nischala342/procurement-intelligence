import type { SourceType } from './types';

/** Mirrors the backend's accepted extensions per source (apps/api/.../parsers/types.ts). */
export interface SourceConfig {
  key: string;
  title: string;
  description: string;
  sourceType: SourceType;
  /** Extensions the backend accepts for this source. */
  accepts: string[];
  /** Formats named in the product brief that the backend cannot ingest yet. */
  unsupported?: string[];
  /** When set, uploading is disabled and this explains why. */
  disabledReason?: string;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // keep in sync with API MAX_UPLOAD_MB

export const SOURCES: SourceConfig[] = [
  {
    key: 'purchase-orders',
    title: 'Purchase Orders (ERP)',
    description: 'PO line exports with delivery, contract and budget data.',
    sourceType: 'purchase_orders',
    accepts: ['.csv', '.xlsx'],
  },
  {
    key: 'invoices',
    title: 'Purchase Invoices',
    description: 'Scanned or digital supplier invoices.',
    sourceType: 'pdf_invoice',
    accepts: ['.pdf'],
    unsupported: ['.png', '.jpg'],
    disabledReason: 'PDF/image extraction is not enabled yet: the extraction strategy has not been chosen. Uploads are disabled until it ships.',
  },
  {
    key: 'tally',
    title: 'Tally Exports',
    description: 'Purchase, payment and sales vouchers.',
    sourceType: 'tally',
    accepts: ['.xml'],
    unsupported: ['.json', '.csv'],
  },
  {
    key: 'shopify',
    title: 'Shopify Sync',
    description: 'Orders and products exports.',
    sourceType: 'shopify',
    accepts: ['.csv', '.json'],
  },
  {
    key: 'sheets',
    title: 'Excel / CSV Sheets',
    description: 'Supplier price lists and purchase sheets.',
    sourceType: 'price_sheet',
    accepts: ['.csv', '.xlsx'],
  },
  {
    key: 'bank',
    title: 'Bank Statements',
    description: 'Debits become vendor payments.',
    sourceType: 'bank_statement',
    accepts: ['.csv', '.xlsx'],
    unsupported: ['.pdf'],
  },
];

export const sourceBySourceType = (t: SourceType): SourceConfig => SOURCES.find((s) => s.sourceType === t) ?? SOURCES[0]!;

export const SOURCE_LABEL: Record<SourceType, string> = {
  purchase_orders: 'Purchase orders',
  pdf_invoice: 'Invoice',
  tally: 'Tally',
  shopify: 'Shopify',
  price_sheet: 'Sheet',
  bank_statement: 'Bank',
};

export const extOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
};
