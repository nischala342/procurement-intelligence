import { AppError } from '../../../utils/AppError';
import type { Parser } from './types';

/**
 * Adapter slot for scanned PDF invoices. The extraction strategy (hosted LLM vs local OCR) is an open
 * product decision, so this adapter deliberately refuses instead of guessing. The `pdf_invoice` source
 * type is already part of the API contract; implementing this function is the only change required.
 */
export const parsePdfInvoice: Parser = async () => {
  throw new AppError(501, 'NOT_IMPLEMENTED', 'PDF invoice ingestion is not enabled yet: the extraction strategy has not been chosen.');
};
