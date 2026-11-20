import { useMemo, useState } from 'react';
import { useDebounced } from '../../../shared/hooks/useDebounced';
import { formatMoney, currencyCode } from '../../../shared/lib/format';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { useProductSearch, useSupplierComparison } from '../hooks';
import type { ProductComparison, ProductOption } from '../types';
import { ComparisonTable } from './ComparisonTable';

const MAX_PRODUCTS = 10;

/** Product x supplier price matrix: pick products, see every supplier's latest price side by side (lowest highlighted). */
function Matrix({ comparisons }: { comparisons: ProductComparison[] }) {
  const vendors = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of comparisons) for (const s of c.suppliers) if (s.matchType === 'identical') m.set(s.vendorId, s.vendorName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [comparisons]);

  return (
    <div className="table-wrap">
      <table className="grid compact matrix">
        <caption className="sr-only">Latest price per base unit by product and supplier, in your base currency. The lowest price in each row is marked with a star.</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            {vendors.map(([id, name]) => (
              <th key={id} scope="col" className="num">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c) => {
            const identical = c.suppliers.filter((s) => s.matchType === 'identical');
            const min = identical.length ? Math.min(...identical.map((s) => s.lastPrice)) : null;
            return (
              <tr key={c.product.id}>
                <th scope="row">
                  {c.product.name}
                  <span className="muted block small">per {c.product.baseUnit}</span>
                </th>
                {vendors.map(([id]) => {
                  const s = identical.find((x) => x.vendorId === id);
                  if (!s) return <td key={id} className="num muted">—</td>;
                  const best = identical.length > 1 && s.lastPrice === min;
                  return (
                    <td key={id} className={`num tnum ${best ? 'best' : ''}`}>
                      {best && <span aria-hidden="true">★ </span>}
                      {formatMoney(s.lastPrice)}
                      {best && <span className="sr-only"> (lowest)</span>}
                      <span className="muted block small">{s.pricePoints} pts</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SupplierComparisonMatrix() {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<ProductOption[]>([]);
  const debounced = useDebounced(search.trim());
  const results = useProductSearch(debounced);
  const ids = picked.map((p) => p.id);
  const cmp = useSupplierComparison(ids);

  const toggle = (p: ProductOption) =>
    setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : cur.length >= MAX_PRODUCTS ? cur : [...cur, p]));

  return (
    <Card title="Compare Suppliers">
      <p className="muted">Choose up to {MAX_PRODUCTS} products to see which suppliers sell them, their latest prices, and how stable those prices are.</p>
      <div className="picker">
        <div className="picker-search">
          <input type="search" placeholder="Search products by name or SKU…" aria-label="Search products to compare" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="picker-results" aria-label="Product search results" aria-busy={results.isFetching}>
            {(results.data ?? []).map((p) => {
              const on = picked.some((x) => x.id === p.id);
              return (
                <li key={p.id}>
                  <label className="check">
                    <input type="checkbox" checked={on} onChange={() => toggle(p)} disabled={!on && picked.length >= MAX_PRODUCTS} />
                    <span>
                      {p.name}
                      {p.sku && <span className="muted small tnum"> · {p.sku}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
            {results.isSuccess && results.data.length === 0 && <li className="muted">No products found.</li>}
          </ul>
        </div>
        <div className="picker-selected" aria-live="polite">
          <strong>Selected ({picked.length})</strong>
          <div className="chips">
            {picked.length === 0 && <span className="muted">None yet</span>}
            {picked.map((p) => (
              <button key={p.id} type="button" className="chip chip-btn" onClick={() => toggle(p)} aria-label={`Remove ${p.name}`}>
                {p.name} ✕
              </button>
            ))}
          </div>
        </div>
      </div>

      {cmp.isError && (
        <p className="error" role="alert">
          {cmp.error instanceof Error ? cmp.error.message : 'Comparison failed'}
        </p>
      )}
      {picked.length === 0 ? (
        <EmptyState title="Pick products to compare" hint="Select one or more products above to build the supplier comparison matrix." />
      ) : cmp.isPending ? (
        <p className="muted" role="status">
          Comparing suppliers…
        </p>
      ) : cmp.data ? (
        <>
          <h3 className="section">Latest price per base unit ({currencyCode()})</h3>
          <Matrix comparisons={cmp.data} />
          <h3 className="section">Details &amp; stability</h3>
          {cmp.data.map((c) => (
            <details key={c.product.id} className="alt-block" open={cmp.data.length <= 3}>
              <summary>
                <strong>{c.product.name}</strong> <span className="muted small">· {c.suppliers.length} supplier{c.suppliers.length === 1 ? '' : 's'}</span>
              </summary>
              {c.suppliers.length === 0 ? <p className="muted">No supplier prices recorded for this product.</p> : <ComparisonTable comparison={c} />}
            </details>
          ))}
        </>
      ) : null}
    </Card>
  );
}
