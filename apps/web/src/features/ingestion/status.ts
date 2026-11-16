import type { Tone } from '../../shared/ui/Pill';
import type { IngestionJob, PipelineStatus, Transaction } from './types';

/** failed -> FAILED, processing -> PARSING, unresolved entity matches -> NEEDS_REVIEW, otherwise PROCESSED. */
export function pipelineStatus(job: IngestionJob): PipelineStatus {
  if (job.status === 'failed') return 'FAILED';
  if (job.status === 'processing') return 'PARSING';
  if ((job.reviewPending ?? 0) > 0) return 'NEEDS_REVIEW';
  return 'PROCESSED';
}

export const STATUS_META: Record<PipelineStatus, { tone: Tone; glyph: string; label: string; hint: string }> = {
  PENDING: { tone: 'neutral', glyph: '○', label: 'Pending', hint: 'Queued, waiting to upload' },
  PARSING: { tone: 'info', glyph: '◐', label: 'Parsing', hint: 'Extracting and normalising' },
  NEEDS_REVIEW: { tone: 'warn', glyph: '⚠', label: 'Needs review', hint: 'Ambiguous entity matches need a decision' },
  PROCESSED: { tone: 'ok', glyph: '✓', label: 'Processed', hint: 'Normalised and saved' },
  FAILED: { tone: 'bad', glyph: '✕', label: 'Failed', hint: 'Could not be processed' },
};

type Ref = { id: string; name: string } | string | null | undefined;
export const refName = (r: Ref): string => (r && typeof r === 'object' ? r.name : '');
export const refId = (r: Ref): string | undefined => (r && typeof r === 'object' ? r.id : r || undefined);

export const vendorName = (t: Transaction) => refName(t.vendorId) || '—';
