import { faker } from '@faker-js/faker';

export interface ItemSeed {
  _id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  quantity: number;
  status: 'active' | 'draft' | 'archived';
}

/** Deterministic ObjectId hex string from a number: 24 hex chars. */
export const oid = (n: number): string => n.toString(16).padStart(24, '0');

/**
 * Fixed fixtures with known IDs/slugs so automated tests can reliably query them.
 * IDs: 000000000000000000000001..3 — do not change without updating docs/api-reference.md.
 */
export const FIXTURE_ITEMS: ItemSeed[] = [
  {
    _id: oid(1),
    name: 'Fixture Laptop',
    slug: 'fixture-laptop',
    description: 'Known fixture: active hardware item.',
    category: 'hardware',
    price: 1299.99,
    quantity: 25,
    status: 'active',
  },
  {
    _id: oid(2),
    name: 'Fixture Software License',
    slug: 'fixture-software-license',
    description: 'Known fixture: draft software item.',
    category: 'software',
    price: 499,
    quantity: 100,
    status: 'draft',
  },
  {
    _id: oid(3),
    name: 'Fixture Legacy Printer',
    slug: 'fixture-legacy-printer',
    description: 'Known fixture: archived office item.',
    category: 'office',
    price: 149.5,
    quantity: 0,
    status: 'archived',
  },
];

const CATEGORIES = ['hardware', 'software', 'office', 'services', 'logistics'] as const;
const STATUSES = ['active', 'active', 'active', 'draft', 'archived'] as const;

export const GENERATED_COUNT = 25;

/** Generated items are fully reproducible: fixed seed, fixed ref date, index-derived IDs/slugs. */
export function generateItems(count = GENERATED_COUNT): ItemSeed[] {
  faker.seed(42);
  faker.setDefaultRefDate('2025-01-01T00:00:00.000Z');
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      _id: oid(1000 + n),
      name: `${faker.commerce.productAdjective()} ${faker.commerce.product()} ${String(n).padStart(3, '0')}`,
      slug: `generated-item-${String(n).padStart(3, '0')}`,
      description: faker.commerce.productDescription().slice(0, 300),
      category: faker.helpers.arrayElement(CATEGORIES),
      price: Number(faker.commerce.price({ min: 5, max: 5000, dec: 2 })),
      quantity: faker.number.int({ min: 0, max: 500 }),
      status: faker.helpers.arrayElement(STATUSES),
    };
  });
}

export const allItems = (): ItemSeed[] => [...FIXTURE_ITEMS, ...generateItems()];
