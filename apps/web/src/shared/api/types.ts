/** Mirrors the backend envelope: apps/api/src/utils/response.ts */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody;
  meta?: Record<string, unknown>;
}

export interface ApiResult<T, M = Record<string, unknown>> {
  data: T;
  meta: M;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
