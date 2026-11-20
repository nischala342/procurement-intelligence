import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCatalog, fetchProductIntelligence, saveReorderSettings, type CatalogParams, type ReorderSettings } from './api';

// Everything is namespaced under ['products'] so saving settings refreshes the catalog and the open deep-dive together.
export const productKeys = {
  all: ['products'] as const,
  catalog: (p: CatalogParams) => ['products', 'catalog', p] as const,
  intelligence: (id: string) => ['products', 'intelligence', id] as const,
};

export function useProductCatalog(params: CatalogParams) {
  return useQuery({ queryKey: productKeys.catalog(params), queryFn: () => fetchCatalog(params), placeholderData: keepPreviousData });
}

export function useProductIntelligence(productId: string | null) {
  return useQuery({
    queryKey: productKeys.intelligence(productId ?? ''),
    queryFn: () => fetchProductIntelligence(productId!),
    enabled: Boolean(productId),
  });
}

export function useSaveReorderSettings(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: ReorderSettings) => saveReorderSettings(productId, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}
