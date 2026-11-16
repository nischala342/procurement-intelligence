import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiEnvelope, ApiResult } from './types';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Fired when the API rejects the session (expired/invalid cookie) so the app can sign the user out. */
export const UNAUTHORIZED_EVENT = 'pi:unauthorized';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15_000,
  withCredentials: true, // send the HTTP-only session cookie
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach optional dev API key.
http.interceptors.request.use((config) => {
  const key = import.meta.env.VITE_API_KEY;
  if (key) config.headers.set('x-api-key', key);
  return config;
});

// Response interceptor: enforce the envelope; failures (incl. 4xx/5xx envelopes) become ApiError.
http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiEnvelope | undefined;
    if (!body || typeof body.success !== 'boolean') {
      throw new ApiError('INVALID_RESPONSE', 'Response did not match the API envelope', res.status);
    }
    if (!body.success) {
      throw new ApiError(body.error?.code ?? 'UNKNOWN', body.error?.message ?? 'Request failed', res.status, body.error?.details);
    }
    return res;
  },
  (error: AxiosError<ApiEnvelope>) => {
    if (error.response) {
      const err = error.response.data?.error;
      if (error.response.status === 401 && err?.code === 'UNAUTHORIZED') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      throw new ApiError(err?.code ?? 'HTTP_ERROR', err?.message ?? error.message, error.response.status, err?.details);
    }
    throw new ApiError('NETWORK_ERROR', 'Unable to reach the API. Is the server running?');
  },
);

export async function request<T, M = Record<string, unknown>>(config: AxiosRequestConfig): Promise<ApiResult<T, M>> {
  const res = await http.request<ApiEnvelope<T>>(config);
  return { data: res.data.data as T, meta: (res.data.meta ?? {}) as M };
}
