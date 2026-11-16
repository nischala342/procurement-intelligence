import { useEffect, useState } from 'react';
import { usePagedQuery } from '../../../shared/hooks/usePagedQuery';
import { formatDate, formatMoney } from '../../../shared/lib/format';
import { Drawer } from '../../../shared/ui/Drawer';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pagination } from '../../../shared/ui/Pagination';
import { Pill } from '../../../shared/ui/Pill';
import { SkeletonRows } from '../../../shared/ui/Skeleton';
import { listProducts, listTransactions } from '../api';
import { refName } from '../status';
import type { Product, Transaction } from '../types';
import { ENTITY_STATUS } from './VendorsTab';

function PriceHistory({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    setError(null);
    if (!product) return;
    let cancelled = false;
    listTransactions(1, 100, { productId: product.id, kind: 'price_quote', sort: '-date' })
      .then((r) => !cancelled && setRows(r.data))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load pricing'));
    return () => {
      cancelled = true;
    };
  }, [product]);

  // lowest current per-base-unit price across vendors, for the comparison highlight
  const best = rows?.reduce<number | null>((m, r) => (r.unitPriceBase != null && (m == null || r.unitPriceBase < m) ? r.unitPriceBase : m), null) ?? null;

  return (
    <Drawer open={Boolean(product)} onClose={onClose} width={680} title={product?.name ?? ''} subtitle={product ? `${product.sku ? `SKU ${product.sku} · ` : ''}base unit ${product.baseUnit}` : undefined}>
      <h3 className="section">Cross-vendor pricing history</h3>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {rows === null && !error ? (
        <p className="muted">Loading…</p>
      ) : rows && rows.length === 0 ? (
        <EmptyState title="No price quotes yet" hint="Price lists and Shopify product exports create quotes for this product." />
      ) : (
        <div className="table-wrap">
          <table className="grid compact">
            <thead>
              <tr>
                <th scope="col">Effective</th>
                <th scope="col">Vendor</th>
                <th scope="col" className="num">
                  Quoted
                </th>
                <th scope="col" className="num">
                  Per {product?.baseUnit} (INR)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id}>
                  <td className="tnum">{formatDate(r.date)}</td>
                  <td>{refName(r.vendorId) || '—'}</td>
                  <td className="num tnum">
                    {formatMoney(r.unitPrice, r.currency)}
                    {r.unit ? ` / ${r.unit}` : ''}
                  </td>
                  <td className="num tnum">
                    {formatMoney(r.unitPriceBase, 'INR')}
                    {best != null && r.unitPriceBase === best && rows.length > 1 && (
                      <>
                        {' '}
                        <Pill tone="ok" glyph="★">
                          Lowest
                        </Pill>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}

export function ProductsTab() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const q = usePagedQuery<Product>((p) => listProducts(p, { search, status }), [search, status]);

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search name, alias or SKU…" aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="needs_review">Needs review</option>
          <option value="merged">Merged</option>
        </select>
      </div>
      {q.error && (
        <p className="error" role="alert">
          {q.error}
        </p>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">SKU</th>
              <th scope="col">Unit of measure</th>
              <th scope="col" className="num">
                Aliases
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {q.loading ? (
              <SkeletonRows cols={5} />
            ) : q.data.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState title="No products yet" hint="Products are created automatically as files are ingested." />
                </td>
              </tr>
            ) : (
              q.data.map((p) => {
                const m = ENTITY_STATUS[p.status];
                return (
                  <tr key={p.id}>
                    <td>
                      <button className="link" onClick={() => setSelected(p)} aria-label={`View pricing history for ${p.name}`}>
                        {p.name}
                      </button>
                    </td>
                    <td className="tnum">{p.sku ?? <span className="muted">—</span>}</td>
                    <td>
                      {p.baseUnit} <span className="muted">({p.dimension})</span>
                    </td>
                    <td className="num tnum">{p.aliases.length}</td>
                    <td>
                      <Pill tone={m.tone} glyph={m.glyph}>
                        {m.label}
                      </Pill>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination meta={q.meta} onPage={q.setPage} />
      <PriceHistory product={selected} onClose={() => setSelected(null)} />
    </>
  );
}
