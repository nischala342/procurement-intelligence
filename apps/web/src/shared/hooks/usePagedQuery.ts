import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiResult, PageMeta } from '../api';

export interface PagedState<T> {
  data: T[];
  meta: PageMeta;
  page: number;
  setPage: (p: number) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY_META: PageMeta = { page: 1, limit: 20, total: 0, totalPages: 1 };

/** Fetches a paginated list; refetches (and returns to page 1) when `deps` change. `reload` refetches silently. */
export function usePagedQuery<T>(fetcher: (page: number) => Promise<ApiResult<T[], PageMeta>>, deps: unknown[]): PagedState<T> {
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const depKey = JSON.stringify(deps);

  useEffect(() => setPage(1), [depKey]);

  useEffect(() => {
    let cancelled = false;
    fetcherRef
      .current(page)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setMeta(res.meta);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, depKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, meta, page, setPage, loading, error, reload };
}
