import { request } from '../../shared/api';
import type { Item, ItemInput, PageMeta } from './types';

export const listItems = (params: { page: number; limit: number; search?: string }) =>
  request<Item[], PageMeta>({ url: '/items', params });

export const createItem = async (input: ItemInput) =>
  (await request<Item>({ url: '/items', method: 'POST', data: input })).data;

export const deleteItem = async (id: string) => (await request<{ id: string; deleted: boolean }>({ url: `/items/${id}`, method: 'DELETE' })).data;
