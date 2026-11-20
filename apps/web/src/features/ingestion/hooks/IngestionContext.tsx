import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { usePagedQuery, type PagedState } from '../../../shared/hooks/usePagedQuery';
import { ReviewDrawer } from '../components/ReviewDrawer';
import { listJobs } from '../api';
import '../ingestion.css';
import type { IngestionJob } from '../types';
import { useUploadQueue, type UploadQueue } from './useUploadQueue';

interface Ctx {
  queue: UploadQueue;
  jobs: PagedState<IngestionJob>;
  openReview: (job: IngestionJob) => void;
}

const IngestionContext = createContext<Ctx | null>(null);

export function useIngestion(): Ctx {
  const ctx = useContext(IngestionContext);
  if (!ctx) throw new Error('useIngestion must be used inside <IngestionProvider>');
  return ctx;
}

/** Owns the upload queue, the polled jobs list and the review drawer, shared by hub, tracker and explorer. */
export function IngestionProvider({ children }: PropsWithChildren) {
  const jobs = usePagedQuery<IngestionJob>((p) => listJobs(p, 10), []);
  const qc = useQueryClient();
  // a finished upload changes every analytic (overview, vendors, products, advisory): drop cached server state
  const onSettled = useCallback(() => {
    jobs.reload();
    void qc.invalidateQueries();
  }, [jobs.reload, qc]);
  const queue = useUploadQueue(onSettled);
  const [reviewJob, setReviewJob] = useState<IngestionJob | null>(null);

  const active = queue.items.some((i) => i.status === 'pending' || i.status === 'uploading') || jobs.data.some((j) => j.status === 'processing');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(jobs.reload, 3000); // poll while anything is in flight
    return () => clearInterval(t);
  }, [active, jobs.reload]);

  // keep the open drawer's job fresh (e.g. reviewPending drops to 0)
  const liveReviewJob = reviewJob ? (jobs.data.find((j) => j.id === reviewJob.id) ?? reviewJob) : null;

  return (
    <IngestionContext.Provider value={{ queue, jobs, openReview: setReviewJob }}>
      {children}
      <ReviewDrawer job={liveReviewJob} onClose={() => setReviewJob(null)} onResolved={jobs.reload} />
    </IngestionContext.Provider>
  );
}
