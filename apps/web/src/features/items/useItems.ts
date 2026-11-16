import { useCallback, useEffect, useState } from 'react';
import { createItem, deleteItem, listItems } from './api';
import type { Item, ItemInput, PageMeta } from './types';

const LIMIT = 8;

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ page: 1, limit: LIMIT, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listItems({ page, limit: LIMIT, search: search || undefined });
      setItems(res.data);
      setMeta(res.meta);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (input: ItemInput) => {
    await createItem(input); // throws ApiError; caller displays it
    setPage(1);
    await load();
  };

  const remove = async (id: string) => {
    try {
      await deleteItem(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete item');
    }
  };

  const updateSearch = (value: string) => {
    setPage(1);
    setSearch(value);
  };

  return { items, meta, page, setPage, search, updateSearch, loading, error, add, remove };
}
