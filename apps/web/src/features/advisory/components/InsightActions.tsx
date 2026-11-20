import { useSetInsightStatus } from '../hooks';
import type { Insight, InsightStatus } from '../types';

/** Lifecycle actions: mark actioned, snooze, dismiss, or reopen. Shared by cards and the evidence drawer. */
export function InsightActions({ insight, compact = false }: { insight: Pick<Insight, 'id' | 'status'>; compact?: boolean }) {
  const set = useSetInsightStatus();
  const go = (status: InsightStatus, snoozeDays?: number) => set.mutate({ id: insight.id, status, ...(snoozeDays ? { snoozeDays } : {}) });
  const busy = set.isPending;
  const cls = compact ? 'btn btn-ghost' : 'btn btn-ghost';
  return (
    <>
      {insight.status === 'ACTIVE' ? (
        <>
          <button className={cls} disabled={busy} onClick={() => go('ACTIONED')}>
            Mark actioned
          </button>
          <button className={cls} disabled={busy} onClick={() => go('SNOOZED', 14)} title="Hide for 14 days; it returns if still relevant">
            Snooze 14d
          </button>
          <button className={cls} disabled={busy} onClick={() => go('DISMISSED')}>
            Dismiss
          </button>
        </>
      ) : (
        <button className={cls} disabled={busy} onClick={() => go('ACTIVE')}>
          Reopen
        </button>
      )}
      {set.isError && (
        <span className="error small" role="alert">
          {set.error instanceof Error ? set.error.message : 'Could not update'}
        </span>
      )}
    </>
  );
}
