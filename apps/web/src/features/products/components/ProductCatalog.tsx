import { useEffect, useState } from 'react';
import { useDebounced } from '../../../shared/hooks/useDebounced';
import { formatMoney } from '../../../shared/lib/format';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pagination } from '../../../shared/ui/Pagination';
import { Pill } from '../../../shared/ui/Pill';
import { SkeletonRows } from '../../../shared/ui/Skeleton';
import { useProductCatalog } from '../hooks';
import type { ProductSort } from '../types';
import { ProductIntelligenceDrawer } from './ProductIntelligenceDrawer';

type SortKey = 'name' | 'totalSpend' | 'currentPrice' | 'avgPurchasePrice';

const COLUMNS: Array<{ key: SortKey | null; label: string; num?: boolean }> = [
  { key: 'name', label: 'Product' },
  { key: null, label: 'Unit type' },
  { key: 'currentPrice', label: 'Current price', num: true },
  { key: 'avgPurchasePrice', label: 'Avg purchase price', num: true },
  { key: 'totalSpend', label: 'Spend · share', num: true },
  { key: null, label: 'Primary vendor' },
  { key: null, label: 'Best-performing vendor' },
];
const DIMENSIONS: Record<string, string> = { count: 'Count', mass: 'Weight', volume: 'Volume', length: 'Length', area: 'Area', time: 'Time', data: 'Data', service: 'Service' };

export function ProductCatalog({ openId, onOpenConsumed }: { openId?: string | null; onOpenConsumed?: () => void }) {
  const [search, setSearch] = useState('');
  const [dimension, setDimension] = useState('');
  const [sort, setSort] = useState<ProductSort>('-totalSpend');
  const [page, setPage] = useState(1);
  const [hideMerged, setHideMerged] = useState(true);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  // deep link (e.g. from an advisory evidence drawer): open that product's economics directly
  useEffect(() => {
    if (!openId) return;
    setSelected({ id: openId, name: '' });
    onOpenConsumed?.();
  }, [openId, onOpenConsumed]);
  const debounced = useDebounced(search.trim());
  const q = useProductCatalog({ page, search: debounced || undefined, dimension: dimension || undefined, sort, hideMerged });
  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  const toggleSort = (key: SortKey) => {
    setPage(1);
    setSort((cur) => (cur === key ? (`-${key}` as ProductSort) : cur === `-${key}` ? (key as ProductSort) : key === 'name' ? 'name' : (`-${key}` as ProductSort)));
  };
  const ariaSort = (key: SortKey | null) => (!key ? undefined : sort === key ? 'ascending' : sort === `-${key}` ? 'descending' : 'none');
  const arrow = (key: SortKey) => (sort === key ? '▲' : sort === `-${key}` ? '▼' : '↕');

  return (
    <Card title="Product Catalog">
      <div className="filters">
        <input
          type="search"
          placeholder="Search product name, alias or SKU…"
          aria-label="Search products"
          value={search}
          onChange={(e) => (setSearch(e.target.value), setPage(1))}
        />
        <select aria-label="Filter by unit type" value={dimension} onChange={(e) => (setDimension(e.target.value), setPage(1))}>
          <option value="">All unit types</option>
          {Object.entries(DIMENSIONS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={hideMerged} onChange={(e) => (setHideMerged(e.target.checked), setPage(1))} />
          Hide merged products
        </label>
      </div>
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof Error ? q.error.message : 'Failed to load products'}
        </p>
      )}
      <div className="table-wrap" aria-busy={q.isFetching}>
        <table className="grid">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" className={c.num ? 'num' : undefined} aria-sort={ariaSort(c.key)}>
                  {c.key ? (
                    <button type="button" className="sort-btn" onClick={() => toggleSort(c.key!)}>
                      {c.label} <span aria-hidden="true">{arrow(c.key)}</span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.isPending ? (
              <SkeletonRows cols={COLUMNS.length} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length}>
                  <EmptyState
                    title={debounced || dimension ? 'No products match your filters' : 'No products yet'}
                    hint={debounced || dimension ? 'Try a different search or clear the filters.' : 'Ingest invoices, Tally exports or price lists and your products will appear here with cost analytics.'}
                    action={!debounced && !dimension ? <a className="btn btn-primary" href="#/ingestion">Go to Ingestion</a> : undefined}
                  />
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const s = p.summary;
                return (
                  <tr key={p.id}>
                    <td>
                      <button type="button" className="link strong" onClick={() => setSelected(p)} aria-label={`Open economics for ${p.name}`}>
                        {p.name}
                      </button>
                      <span className="block small muted tnum">{p.sku ?? ''}</span>
                      {p.status === 'needs_review' && (
                        <Pill tone="warn" glyph="⚠">
                          Needs review
                        </Pill>
                      )}
                      {p.status === 'merged' && <Pill glyph="⇢">Merged</Pill>}
                    </td>
                    <td>
                      {DIMENSIONS[p.dimension] ?? p.dimension} <span className="muted small">({p.baseUnit})</span>
                    </td>
                    <td className="num tnum">
                      {s.currentPrice != null ? formatMoney(s.currentPrice) : <span className="muted">—</span>}
                      {s.currentPriceKind === 'quote' && <span className="muted block small">quote</span>}
                    </td>
                    <td className="num tnum">{s.avgPurchasePrice != null ? formatMoney(s.avgPurchasePrice) : <span className="muted">—</span>}</td>
                    <td className="num tnum">
                      {s.totalSpend > 0 ? formatMoney(s.totalSpend) : <span className="muted">—</span>}
                      {s.spendSharePct != null && s.totalSpend > 0 && (
                        <span className="share">
                          <span className="share-bar" aria-hidden="true">
                            <span style={{ width: `${Math.min(100, s.spendSharePct)}%` }} />
                          </span>
                          <span className="small muted">{s.spendSharePct.toFixed(1)}%</span>
                        </span>
                      )}
                    </td>
                    <td>{s.primaryVendor?.name ?? <span className="muted">—</span>}</td>
                    <td>
                      {s.bestVendor ? (
                        <>
                          {s.bestVendor.name}{' '}
                          <Pill tone="ok" glyph="★">
                            <span className="tnum">{Math.round(s.bestVendor.score)}</span>
                          </Pill>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {meta && <Pagination meta={meta} onPage={setPage} />}
      <ProductIntelligenceDrawer product={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
