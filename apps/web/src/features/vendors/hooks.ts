import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSupplierComparison, fetchVendorDirectory, fetchVendorIntelligence, savePaymentTerms, searchProducts, type DirectoryParams } from './api';
import type { Granularity } from './types';

// Keys are namespaced under ['vendors'] so one invalidation refreshes the directory and every open deep-dive.
export const vendorKeys = {
  all: ['vendors'] as const,
  directory: (p: DirectoryParams) => ['vendors', 'directory', p] as const,
  intelligence: (id: string, g: Granularity) => ['vendors', 'intelligence', id, g] as const,
  compare: (ids: string[], baseline?: string) => ['vendors', 'compare', [...ids].sort(), baseline ?? null] as const,
};

export function useVendorDirectory(params: DirectoryParams) {
  return useQuery({ queryKey: vendorKeys.directory(params), queryFn: () => fetchVendorDirectory(params), placeholderData: keepPreviousData });
}

export function useVendorIntelligence(vendorId: string | null, granularity: Granularity) {
  return useQuery({
    queryKey: vendorKeys.intelligence(vendorId ?? '', granularity),
    queryFn: () => fetchVendorIntelligence(vendorId!, granularity),
    enabled: Boolean(vendorId),
    placeholderData: keepPreviousData,
  });
}

export function useSupplierComparison(productIds: string[], baselineVendorId?: string) {
  return useQuery({
    queryKey: vendorKeys.compare(productIds, baselineVendorId),
    queryFn: () => fetchSupplierComparison(productIds, baselineVendorId),
    enabled: productIds.length > 0,
  });
}

export function useProductSearch(search: string) {
  return useQuery({ queryKey: ['vendors', 'product-search', search], queryFn: () => searchProducts(search), placeholderData: keepPreviousData });
}

export function useSavePaymentTerms(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number | null) => savePaymentTerms(vendorId, days),
    onSuccess: () => qc.invalidateQueries({ queryKey: vendorKeys.all }),
  });
}
