export type ItemStatus = 'active' | 'draft' | 'archived';

export interface Item {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  quantity: number;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ItemInput {
  name: string;
  slug?: string;
  description?: string;
  category?: string;
  price: number;
  quantity: number;
  status: ItemStatus;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
