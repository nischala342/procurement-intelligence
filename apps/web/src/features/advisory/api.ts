import { request, type PageMeta } from '../../shared/api';
import type { AdvisorySummary, Insight, InsightDetail, InsightFilters, InsightStatus, RfqDraft, ScanResult } from './types';

export const fetchInsights = (f: InsightFilters, limit = 10) =>
  request<Insight[], PageMeta>({
    url: '/advisory/insights',
    params: { page: f.page, limit, status: f.status, ...(f.type ? { type: f.type } : {}), ...(f.severity ? { severity: f.severity } : {}) },
  });

export const fetchInsightDetail = async (id: string) => (await request<InsightDetail>({ url: `/advisory/insights/${id}` })).data;
export const fetchSummary = async () => (await request<AdvisorySummary>({ url: '/advisory/summary' })).data;

export const runScan = async (asOf?: string) =>
  (await request<ScanResult>({ url: '/advisory/generate', method: 'POST', data: asOf ? { asOf } : {}, timeout: 120_000 })).data;

export const updateStatus = async (id: string, status: InsightStatus, snoozeDays?: number) =>
  (await request<Insight>({ url: `/advisory/insights/${id}/status`, method: 'PATCH', data: { status, ...(snoozeDays ? { snoozeDays } : {}) } })).data;

export interface RfqRequest {
  vendorIds?: string[];
  targetQuantity?: number;
  notes?: string;
}
export const draftRfq = async (id: string, body: RfqRequest) => (await request<RfqDraft>({ url: `/advisory/insights/${id}/rfq-draft`, method: 'POST', data: body })).data;
