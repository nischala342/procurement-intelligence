import { request, type PageMeta } from '../../shared/api';
import type { CatalogProduct, ProductIntelligence, ProductSort } from './types';

export interface CatalogParams {
  page: number;
  search?: string;
  dimension?: string;
  sort: ProductSort;
  hideMerged: boolean;
  limit?: number;
}

export const fetchCatalog = (p: CatalogParams) =>
  request<CatalogProduct[], PageMeta>({
    url: '/products',
    params: {
      page: p.page,
      limit: p.limit ?? 15,
      sort: p.sort,
      hideMerged: p.hideMerged,
      ...(p.search ? { search: p.search } : {}),
      ...(p.dimension ? { dimension: p.dimension } : {}),
    },
  });

export const fetchProductIntelligence = async (id: string) => (await request<ProductIntelligence>({ url: `/products/${id}/intelligence` })).data;

export interface ReorderSettings {
  leadTimeDays: number | null;
  safetyStockDays: number | null;
}
export const saveReorderSettings = async (id: string, s: ReorderSettings) =>
  (await request<{ id: string }>({ url: `/products/${id}`, method: 'PATCH', data: s })).data;
