import { useEffect, useState } from 'react';
import { useDebounced } from '../../../shared/hooks/useDebounced';
import { formatDate, formatMoney } from '../../../shared/lib/format';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pagination } from '../../../shared/ui/Pagination';
import { Pill } from '../../../shared/ui/Pill';
import { SkeletonRows } from '../../../shared/ui/Skeleton';
import { FrequencyPill } from '../display';
import { useVendorDirectory } from '../hooks';
import type { VendorSort } from '../types';
import { VendorIntelligenceDrawer } from './VendorIntelligenceDrawer';

type SortKey = 'name' | 'totalSpend' | 'orderCount' | 'lastPurchaseDate';

const COLUMNS: Array<{ key: SortKey | null; label: string; num?: boolean }> = [
  { key: 'name', label: 'Vendor' },
  { key: 'totalSpend', label: 'Total spend', num: true },
  { key: 'orderCount', label: 'Orders', num: true },
  { key: 'lastPurchaseDate', label: 'Last purchase' },
  { key: null, label: 'Purchase frequency' },
  { key: null, label: 'Payment terms' },
];

export function VendorDirectory({ openId, onOpenConsumed }: { openId?: string | null; onOpenConsumed?: () => void }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<VendorSort>('-totalSpend');
  const [page, setPage] = useState(1);
  const [hideMerged, setHideMerged] = useState(true);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  // deep link (e.g. from an advisory evidence drawer): open that vendor's intelligence directly
  useEffect(() => {
    if (!openId) return;
    setSelected({ id: openId, name: '' });
    onOpenConsumed?.();
  }, [openId, onOpenConsumed]);
  const debounced = useDebounced(search.trim());
  const q = useVendorDirectory({ page, search: debounced || undefined, sort, hideMerged });
  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  const toggleSort = (key: SortKey) => {
    setPage(1);
    setSort((cur) => (cur === key ? (`-${key}` as VendorSort) : cur === `-${key}` ? (key as VendorSort) : key === 'name' ? 'name' : (`-${key}` as VendorSort)));
  };
  const ariaSort = (key: SortKey | null) => (!key ? undefined : sort === key ? 'ascending' : sort === `-${key}` ? 'descending' : 'none');
  const arrow = (key: SortKey) => (sort === key ? '▲' : sort === `-${key}` ? '▼' : '↕');

  return (
    <Card title="Vendor Directory">
      <div className="filters">
        <input
          type="search"
          placeholder="Search vendor name, alias or tax ID…"
          aria-label="Search vendors"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <label className="check">
          <input type="checkbox" checked={hideMerged} onChange={(e) => (setHideMerged(e.target.checked), setPage(1))} />
          Hide merged vendors
        </label>
      </div>
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof Error ? q.error.message : 'Failed to load vendors'}
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
                    title={debounced ? 'No vendors match your search' : 'No vendors yet'}
                    hint={debounced ? 'Try a different name, alias or tax ID.' : 'Ingest invoices, Tally exports or price lists and your suppliers will appear here with spend and pricing analytics.'}
                    action={!debounced ? <a className="btn btn-primary" href="#/ingestion">Go to Ingestion</a> : undefined}
                  />
                </td>
              </tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id}>
                  <td>
                    <button type="button" className="link strong" onClick={() => setSelected(v)} aria-label={`Open intelligence for ${v.name}`}>
                      {v.name}
                    </button>
                    <span className="block small muted tnum">{v.taxId ?? ''}</span>
                    {v.status === 'needs_review' && (
                      <Pill tone="warn" glyph="⚠">
                        Needs review
                      </Pill>
                    )}
                    {v.status === 'merged' && <Pill glyph="⇢">Merged</Pill>}
                  </td>
                  <td className="num tnum">{v.summary.totalSpend > 0 ? formatMoney(v.summary.totalSpend) : <span className="muted">—</span>}</td>
                  <td className="num tnum">{v.summary.orderCount}</td>
                  <td className="tnum">{formatDate(v.summary.lastPurchaseDate)}</td>
                  <td>
                    <FrequencyPill status={v.summary.frequencyStatus} avgDays={v.summary.avgDaysBetweenOrders} />
                  </td>
                  <td>{v.paymentTerms ?? <span className="muted">Not set</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {meta && <Pagination meta={meta} onPage={setPage} />}
      <VendorIntelligenceDrawer vendor={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
