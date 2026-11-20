import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { draftRfq, fetchInsightDetail, fetchInsights, fetchSummary, runScan, updateStatus, type RfqRequest } from './api';
import type { InsightFilters, InsightStatus } from './types';

// Everything is namespaced under ['advisory'] so a scan or a status change refreshes the feed, summary and open drawer.
export const advisoryKeys = {
  all: ['advisory'] as const,
  insights: (f: InsightFilters) => ['advisory', 'insights', f] as const,
  detail: (id: string) => ['advisory', 'detail', id] as const,
  summary: ['advisory', 'summary'] as const,
};

export function useInsights(filters: InsightFilters) {
  return useQuery({ queryKey: advisoryKeys.insights(filters), queryFn: () => fetchInsights(filters), placeholderData: keepPreviousData });
}

export function useInsightDetail(id: string | null) {
  return useQuery({ queryKey: advisoryKeys.detail(id ?? ''), queryFn: () => fetchInsightDetail(id!), enabled: Boolean(id) });
}

export function useAdvisorySummary() {
  return useQuery({ queryKey: advisoryKeys.summary, queryFn: fetchSummary });
}

export function useRunScan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (asOf?: string) => runScan(asOf), onSuccess: () => (void qc.invalidateQueries({ queryKey: ['analytics'] }), qc.invalidateQueries({ queryKey: advisoryKeys.all })) });
}

export function useSetInsightStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: InsightStatus; snoozeDays?: number }) => updateStatus(v.id, v.status, v.snoozeDays),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['analytics'] }), qc.invalidateQueries({ queryKey: advisoryKeys.all })),
  });
}

/** Drafts are generated on demand and not cached or stored. */
export function useRfqDraft(insightId: string) {
  return useMutation({ mutationFn: (body: RfqRequest) => draftRfq(insightId, body) });
}
