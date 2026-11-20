import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { request } from '../../shared/api';
import type { Overview } from './types';

export const overviewKeys = { all: ['analytics'] as const, overview: (months: number) => ['analytics', 'overview', months] as const };

export const fetchOverview = async (months: number) => (await request<Overview>({ url: '/analytics/overview', params: { months } })).data;

export function useOverview(months: number) {
  return useQuery({ queryKey: overviewKeys.overview(months), queryFn: () => fetchOverview(months), placeholderData: keepPreviousData });
}
