import { Fragment, useMemo, useState } from 'react';
import { formatDate, formatBytes } from '../../../shared/lib/format';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pagination } from '../../../shared/ui/Pagination';
import { Pill } from '../../../shared/ui/Pill';
import { SkeletonRows } from '../../../shared/ui/Skeleton';
import { useIngestion } from '../hooks/IngestionContext';
import { SOURCE_LABEL } from '../sources';
import { STATUS_META, pipelineStatus } from '../status';
import type { IngestionJob, PipelineStatus, QueueItem, SourceType } from '../types';

interface Row {
  key: string;
  filename: string;
  size: number;
  source: SourceType;
  status: PipelineStatus;
  when?: string;
  job?: IngestionJob;
  queue?: QueueItem;
  detail?: string;
}

export function PipelineTracker() {
  const { jobs, queue, openReview } = useIngestion();
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    // Files still in the browser (queued / uploading / rejected by the server) come first.
    const local: Row[] = queue.items
      .filter((i) => i.status === 'pending' || i.status === 'uploading' || i.status === 'failed')
      .map((i) => ({
        key: i.id,
        filename: i.file.name,
        size: i.file.size,
        source: i.sourceType,
        status: i.status === 'pending' ? 'PENDING' : i.status === 'uploading' ? 'PARSING' : 'FAILED',
        queue: i,
        detail: i.error,
      }));
    const remote: Row[] = jobs.data.map((j) => ({
      key: j.id,
      filename: j.filename,
      size: j.fileSize,
      source: j.sourceType,
      status: pipelineStatus(j),
      when: j.createdAt,
      job: j,
      detail: j.failureReason,
    }));
    // A failed job and its retryable queue item describe the same file; show the job once.
    const failedJobIds = new Set(remote.map((r) => r.job!.id));
    return [...local.filter((l) => !(l.queue?.jobId && failedJobIds.has(l.queue.jobId))), ...remote];
  }, [queue.items, jobs.data]);

  const retry = (row: Row) => {
    const item = row.queue ?? (row.job ? queue.findByJobId(row.job.id) : undefined);
    if (item) queue.retry(item.id);
  };
  const canRetry = (row: Row) => row.status === 'FAILED' && Boolean(row.queue ?? (row.job && queue.findByJobId(row.job.id)));

  return (
    <Card
      title="Pipeline Activity"
      action={
        <button className="btn btn-ghost" onClick={jobs.reload}>
          Refresh
        </button>
      }
    >
      {jobs.error && (
        <p className="error" role="alert">
          {jobs.error}
        </p>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Source</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Rows
              </th>
              <th scope="col" className="num">
                Transactions
              </th>
              <th scope="col">Uploaded</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.loading && rows.length === 0 ? (
              <SkeletonRows cols={7} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState title="No ingestion activity yet" hint="Drop your first invoice, Tally export or price sheet in the Ingestion Hub above." />
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const m = STATUS_META[r.status];
                const expandable = Boolean(r.detail || r.job?.rowErrors?.length);
                const isOpen = open === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr>
                      <td>
                        <span className="file-name" title={r.filename}>
                          {r.filename}
                        </span>
                        <span className="muted tnum block">{formatBytes(r.size)}</span>
                      </td>
                      <td>
                        <span className="chip">{SOURCE_LABEL[r.source]}</span>
                      </td>
                      <td>
                        <span title={m.hint}>
                          <Pill tone={m.tone} glyph={m.glyph}>
                            {m.label}
                            {r.status === 'NEEDS_REVIEW' && r.job ? ` (${r.job.reviewPending})` : ''}
                          </Pill>
                        </span>
                      </td>
                      <td className="num tnum">
                        {r.job ? (
                          <>
                            {r.job.stats.rowsParsed}
                            {r.job.stats.rowsFailed > 0 && <span className="warn-text"> · {r.job.stats.rowsFailed} failed</span>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num tnum">{r.job ? r.job.stats.transactionsCreated : '—'}</td>
                      <td className="muted">{r.when ? formatDate(r.when, true) : 'Just now'}</td>
                      <td className="actions">
                        {r.status === 'NEEDS_REVIEW' && r.job && (
                          <button className="btn btn-primary" onClick={() => openReview(r.job!)}>
                            Review
                          </button>
                        )}
                        {r.status === 'FAILED' && (
                          <button
                            className="btn btn-ghost"
                            disabled={!canRetry(r)}
                            title={canRetry(r) ? 'Upload this file again' : 'The original file is no longer in this browser session. Upload it again.'}
                            onClick={() => retry(r)}
                          >
                            Retry
                          </button>
                        )}
                        {expandable && (
                          <button
                            className="btn btn-ghost"
                            aria-expanded={isOpen}
                            aria-controls={`detail-${r.key}`}
                            onClick={() => setOpen(isOpen ? null : r.key)}
                          >
                            {isOpen ? 'Hide' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={`detail-${r.key}`} className="detail-row">
                        <td colSpan={7}>
                          {r.detail && <p className="error">{r.detail}</p>}
                          {r.job && r.job.rowErrors.length > 0 && (
                            <>
                              <strong>
                                {r.job.rowErrors.length} row issue{r.job.rowErrors.length > 1 ? 's' : ''}
                              </strong>
                              <ul className="issues">
                                {r.job.rowErrors.slice(0, 25).map((e) => (
                                  <li key={`${e.rowNumber}-${e.message}`}>
                                    <span className="tnum">Row {e.rowNumber}</span>: {e.message}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination meta={jobs.meta} onPage={jobs.setPage} />
    </Card>
  );
}
