import { useCallback, useEffect, useState } from 'react';
import { confirmProduct, confirmVendor, getProduct, getVendor, listTransactions, mergeProduct, mergeVendor } from '../api';
import { refId } from '../status';
import type { Product, Vendor } from '../types';

export type ReviewEntity =
  | { kind: 'vendor'; entity: Vendor; candidate: Vendor | null }
  | { kind: 'product'; entity: Product; candidate: Product | null };

export interface ReviewState {
  items: ReviewEntity[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  merge: (item: ReviewEntity) => Promise<void>;
  createNew: (item: ReviewEntity) => Promise<void>;
}

const MAX_PAGES = 5; // scan up to 500 transaction lines of the job for flagged entities

/** Loads the vendors/products of a job that are flagged `needs_review`, with their suggested canonical match. */
export function useReview(jobId: string | null, onResolved: () => void): ReviewState {
  const [items, setItems] = useState<ReviewEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const vendorIds = new Set<string>();
      const productIds = new Set<string>();
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await listTransactions(page, 100, { jobId });
        for (const t of res.data) {
          const v = typeof t.vendorId === 'object' && t.vendorId?.status === 'needs_review' ? t.vendorId.id : undefined;
          const p = typeof t.productId === 'object' && t.productId?.status === 'needs_review' ? t.productId.id : undefined;
          if (v) vendorIds.add(v);
          if (p) productIds.add(p);
        }
        if (page >= res.meta.totalPages) break;
      }
      const out: ReviewEntity[] = [];
      for (const id of vendorIds) {
        const entity = await getVendor(id);
        const candidate = entity.possibleDuplicateOf ? await getVendor(refId(entity.possibleDuplicateOf)!).catch(() => null) : null;
        out.push({ kind: 'vendor', entity, candidate });
      }
      for (const id of productIds) {
        const entity = await getProduct(id);
        const candidate = entity.possibleDuplicateOf ? await getProduct(refId(entity.possibleDuplicateOf)!).catch(() => null) : null;
        out.push({ kind: 'product', entity, candidate });
      }
      setItems(out);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load review items');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    setItems([]);
    void load();
  }, [load]);

  const act = async (item: ReviewEntity, fn: () => Promise<unknown>) => {
    setBusyId(item.entity.id);
    try {
      await fn();
      setItems((prev) => prev.filter((i) => i.entity.id !== item.entity.id));
      setError(null);
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  return {
    items,
    loading,
    error,
    busyId,
    merge: (item) =>
      act(item, () => {
        if (!item.candidate) return Promise.reject(new Error('No suggested match to merge into'));
        return item.kind === 'vendor' ? mergeVendor(item.entity.id, item.candidate.id) : mergeProduct(item.entity.id, item.candidate.id);
      }),
    createNew: (item) => act(item, () => (item.kind === 'vendor' ? confirmVendor(item.entity.id) : confirmProduct(item.entity.id))),
  };
}
