export type SourceType = 'price_sheet' | 'tally' | 'shopify' | 'bank_statement' | 'pdf_invoice';
export type ApiJobStatus = 'processing' | 'completed' | 'completed_with_errors' | 'failed';
/** UI pipeline status derived from the API job status + pending review count (see `pipelineStatus`). */
export type PipelineStatus = 'PENDING' | 'PARSING' | 'NEEDS_REVIEW' | 'PROCESSED' | 'FAILED';

export interface JobStats {
  rowsParsed: number;
  rowsSkipped: number;
  rowsFailed: number;
  transactionsCreated: number;
  duplicatesIgnored: number;
  vendorsCreated: number;
  vendorsMatched: number;
  productsCreated: number;
  productsMatched: number;
  needsReview: number;
}

export interface RowIssue {
  rowNumber: number;
  message: string;
}

export interface IngestionJob {
  id: string;
  sourceType: SourceType;
  filename: string;
  fileSize: number;
  fileHash: string;
  status: ApiJobStatus;
  stats: JobStats;
  rowErrors: RowIssue[];
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
  /** Vendors/products from this job that still await a human decision. */
  reviewPending: number;
}

export interface RawRecord {
  id: string;
  jobId: string;
  rowNumber: number;
  payload: Record<string, unknown>;
  status: 'normalized' | 'error';
  error?: string;
}

export type EntityStatus = 'active' | 'needs_review' | 'merged';

export interface Vendor {
  id: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  taxId?: string;
  status: EntityStatus;
  possibleDuplicateOf?: string;
  similarityScore?: number;
  mergedInto?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  normalizedName: string;
  sku?: string;
  aliases: string[];
  baseUnit: string;
  dimension: 'count' | 'mass' | 'volume' | 'length';
  status: EntityStatus;
  possibleDuplicateOf?: string;
  similarityScore?: number;
  createdAt: string;
}

export interface VendorRef {
  id: string;
  name: string;
  status: EntityStatus;
  taxId?: string;
}
export interface ProductRef {
  id: string;
  name: string;
  sku?: string;
  status: EntityStatus;
  baseUnit: string;
}

export type TransactionKind = 'invoice_line' | 'price_quote' | 'payment' | 'sale';

export interface Transaction {
  id: string;
  kind: TransactionKind;
  sourceType: SourceType;
  jobId: string;
  rawRecordId: string;
  /** Populated object on reads; may be absent when the source had no vendor/product. */
  vendorId?: VendorRef | string | null;
  productId?: ProductRef | string | null;
  reference?: string;
  date?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  baseQuantity?: number;
  baseUnit?: string;
  unitPrice?: number;
  amount?: number;
  currency: string;
  fxRate?: number;
  amountBase?: number;
  unitPriceBase?: number;
  warnings: string[];
}

export interface UploadOptions {
  dayFirst: boolean;
  defaultCurrency: string;
}

export type QueueStatus = 'pending' | 'uploading' | 'done' | 'duplicate' | 'failed';

export interface QueueItem {
  id: string;
  file: File;
  sourceType: SourceType;
  status: QueueStatus;
  progress: number;
  attempt: number;
  allowDuplicate: boolean;
  error?: string;
  jobId?: string;
}
