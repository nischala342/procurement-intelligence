import { request, type PageMeta } from '../../shared/api';
import type { DirectoryVendor, Granularity, ProductComparison, ProductOption, VendorIntelligence, VendorSort } from './types';

export interface DirectoryParams {
  page: number;
  search?: string;
  sort: VendorSort;
  hideMerged: boolean;
  limit?: number;
}

export const fetchVendorDirectory = (p: DirectoryParams) =>
  request<DirectoryVendor[], PageMeta>({
    url: '/vendors',
    params: { page: p.page, limit: p.limit ?? 15, sort: p.sort, hideMerged: p.hideMerged, ...(p.search ? { search: p.search } : {}) },
  });

export const fetchVendorIntelligence = async (id: string, granularity: Granularity) =>
  (await request<VendorIntelligence>({ url: `/vendors/${id}/intelligence`, params: { granularity } })).data;

export const fetchSupplierComparison = async (productIds: string[], baselineVendorId?: string) =>
  (
    await request<ProductComparison[]>({
      url: '/vendors/compare',
      params: { productIds: productIds.join(','), ...(baselineVendorId ? { baselineVendorId } : {}) },
    })
  ).data;

export const savePaymentTerms = async (id: string, paymentTermsDays: number | null) =>
  (await request<{ id: string; paymentTermsDays?: number }>({ url: `/vendors/${id}`, method: 'PATCH', data: { paymentTermsDays } })).data;

export const searchProducts = async (search: string): Promise<ProductOption[]> =>
  (await request<ProductOption[]>({ url: '/products', params: { limit: 10, status: 'active', ...(search ? { search } : {}) } })).data;
