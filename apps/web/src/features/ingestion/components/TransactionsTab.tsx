import { useState } from 'react';
import { usePagedQuery } from '../../../shared/hooks/usePagedQuery';
import { formatDate, formatMoney, formatNumber } from '../../../shared/lib/format';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pagination } from '../../../shared/ui/Pagination';
import { Pill } from '../../../shared/ui/Pill';
import { SkeletonRows } from '../../../shared/ui/Skeleton';
import { listTransactions } from '../api';
import { SOURCE_LABEL } from '../sources';
import { vendorName } from '../status';
import type { Transaction, TransactionKind } from '../types';
import { TransactionDrawer } from './TransactionDrawer';

export const KIND_LABEL: Record<TransactionKind, string> = {
  invoice_line: 'Invoice',
  price_quote: 'Price quote',
  payment: 'Payment',
  sale: 'Sale',
};
const KIND_GLYPH: Record<TransactionKind, string> = { invoice_line: '▤', price_quote: '₹', payment: '↗', sale: '↙' };

export function TransactionsTab() {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState<Transaction | null>(null);
  const q = usePagedQuery<Transaction>((p) => listTransactions(p, 20, { search, kind, sourceType: source }), [search, kind, source]);

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search reference or description…" aria-label="Search transactions" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
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
              <th scope="col">Date</th>
              <th scope="col">Reference</th>
              <th scope="col">Vendor</th>
              <th scope="col">Type</th>
              <th scope="col">Source</th>
              <th scope="col" className="num">
                Qty
              </th>
              <th scope="col" className="num">
                Amount
              </th>
              <th scope="col" className="num">
                Total (INR)
              </th>
            </tr>
          </thead>
          <tbody>
            {q.loading ? (
              <SkeletonRows cols={8} />
            ) : q.data.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState title="No transactions found" hint={search || kind || source ? 'Try clearing the filters.' : 'Ingest a file to populate the ledger.'} />
                </td>
              </tr>
            ) : (
              q.data.map((t) => (
                <tr key={t.id}>
                  <td className="tnum">{formatDate(t.date)}</td>
                  <td>
                    <button className="link" onClick={() => setSelected(t)} aria-label={`Open details for ${t.reference ?? 'transaction'} ${t.id.slice(-6)}`}>
                      {t.reference ?? <span className="muted">(no reference)</span>}
                    </button>
                  </td>
                  <td>{vendorName(t)}</td>
                  <td>
                    <Pill glyph={KIND_GLYPH[t.kind]}>{KIND_LABEL[t.kind]}</Pill>
                  </td>
                  <td>
                    <span className="chip">{SOURCE_LABEL[t.sourceType]}</span>
                  </td>
                  <td className="num tnum">{t.quantity != null ? `${formatNumber(t.quantity)} ${t.unit ?? ''}` : '—'}</td>
                  <td className="num tnum">{formatMoney(t.amount ?? t.unitPrice, t.currency)}</td>
                  <td className="num tnum">{formatMoney(t.amountBase, 'INR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination meta={q.meta} onPage={q.setPage} />
      <TransactionDrawer transaction={selected} onClose={() => setSelected(null)} />
    </>
  );
}
