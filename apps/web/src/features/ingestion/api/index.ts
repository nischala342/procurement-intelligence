import { request, type PageMeta } from '../../../shared/api';
import type { IngestionJob, Product, RawRecord, SourceType, Transaction, UploadOptions, Vendor } from '../types';

// NOTE: the product brief names `POST /api/v1/ingest/:source`; the implemented contract is
// `POST /api/v1/ingestion/jobs` with a `sourceType` form field (see docs/api-reference.md).

export function uploadFile(
  file: File,
  sourceType: SourceType,
  opts: UploadOptions & { allowDuplicate: boolean },
  onProgress: (pct: number) => void,
) {
  const form = new FormData();
  form.append('sourceType', sourceType);
  form.append('dayFirst', String(opts.dayFirst));
  if (opts.defaultCurrency.trim()) form.append('defaultCurrency', opts.defaultCurrency.trim());
  if (opts.allowDuplicate) form.append('allowDuplicate', 'true');
  form.append('file', file); // file last so text fields are parsed first
  return request<IngestionJob>({
    url: '/ingestion/jobs',
    method: 'POST',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
    onUploadProgress: (e) => e.total && onProgress(Math.round((e.loaded * 100) / e.total)),
  });
}

export const listJobs = (page: number, limit = 10) => request<IngestionJob[], PageMeta>({ url: '/ingestion/jobs', params: { page, limit } });
export const getRawRecord = async (id: string) => (await request<RawRecord>({ url: `/ingestion/records/${id}` })).data;

export interface TransactionFilters {
  search?: string;
  kind?: string;
  sourceType?: string;
  vendorId?: string;
  productId?: string;
  jobId?: string;
  reference?: string;
  sort?: string;
}
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

export const listTransactions = (page: number, limit: number, f: TransactionFilters = {}) =>
  request<Transaction[], PageMeta>({ url: '/transactions', params: { page, limit, ...clean(f) } });

export const listVendors = (page: number, params: { search?: string; status?: string; limit?: number } = {}) =>
  request<Vendor[], PageMeta>({ url: '/vendors', params: { page, limit: 20, ...clean(params) } });
export const getVendor = async (id: string) => (await request<Vendor>({ url: `/vendors/${id}` })).data;
export const mergeVendor = (id: string, targetId: string) => request({ url: `/vendors/${id}/merge`, method: 'POST', data: { targetId } });
export const confirmVendor = (id: string) => request<Vendor>({ url: `/vendors/${id}`, method: 'PATCH', data: { status: 'active' } });

export const listProducts = (page: number, params: { search?: string; status?: string; limit?: number } = {}) =>
  request<Product[], PageMeta>({ url: '/products', params: { page, limit: 20, ...clean(params) } });
export const getProduct = async (id: string) => (await request<Product>({ url: `/products/${id}` })).data;
export const mergeProduct = (id: string, targetId: string) => request({ url: `/products/${id}/merge`, method: 'POST', data: { targetId } });
export const confirmProduct = (id: string) => request<Product>({ url: `/products/${id}`, method: 'PATCH', data: { status: 'active' } });
