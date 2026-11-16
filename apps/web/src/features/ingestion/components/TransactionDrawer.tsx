import { useEffect, useState } from 'react';
import { formatDate, formatMoney, formatNumber } from '../../../shared/lib/format';
import { Drawer } from '../../../shared/ui/Drawer';
import { Pill } from '../../../shared/ui/Pill';
import { getRawRecord, listTransactions } from '../api';
import { SOURCE_LABEL } from '../sources';
import { refId, refName } from '../status';
import type { RawRecord, Transaction } from '../types';
import { KIND_LABEL } from './TransactionsTab';

export function TransactionDrawer({ transaction: t, onClose }: { transaction: Transaction | null; onClose: () => void }) {
  const [lines, setLines] = useState<Transaction[]>([]);
  const [raw, setRaw] = useState<RawRecord | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLines([]);
    setRaw(null);
    setShowRaw(false);
    setError(null);
    if (!t) return;
    let cancelled = false;
    const vendor = refId(t.vendorId);
    // All lines of the same document (reference + vendor) form the drilldown.
    const linesReq = t.reference ? listTransactions(1, 100, { reference: t.reference, vendorId: vendor, sourceType: t.sourceType, sort: 'date' }).then((r) => r.data) : Promise.resolve([t]);
    Promise.all([linesReq, getRawRecord(t.rawRecordId)])
      .then(([l, r]) => !cancelled && (setLines(l.length ? l : [t]), setRaw(r)))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load details'));
    return () => {
      cancelled = true;
    };
  }, [t]);

  const total = lines.reduce((n, l) => n + (l.amountBase ?? 0), 0);
  const hasTotal = lines.some((l) => l.amountBase != null);

  return (
    <Drawer open={Boolean(t)} onClose={onClose} width={720} title={t ? `${KIND_LABEL[t.kind]} ${t.reference ?? ''}` : ''} subtitle={t ? `${refName(t.vendorId) || 'No vendor'} · ${formatDate(t.date)} · ${SOURCE_LABEL[t.sourceType]}` : undefined}>
      {t && (
        <>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <h3 className="section">Line items</h3>
          <div className="table-wrap">
            <table className="grid compact">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col" className="num">
                    Qty
                  </th>
                  <th scope="col" className="num">
                    Base qty
                  </th>
                  <th scope="col" className="num">
                    Unit price
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
                {(lines.length ? lines : [t]).map((l) => (
                  <tr key={l.id} className={l.id === t.id ? 'highlight' : ''}>
                    <td>{refName(l.productId) || l.description || '—'}</td>
                    <td className="num tnum">{l.quantity != null ? `${formatNumber(l.quantity)} ${l.unit ?? ''}` : '—'}</td>
                    <td className="num tnum">{l.baseQuantity != null ? `${formatNumber(l.baseQuantity)} ${l.baseUnit ?? ''}` : '—'}</td>
                    <td className="num tnum">{formatMoney(l.unitPrice, l.currency)}</td>
                    <td className="num tnum">{formatMoney(l.amount, l.currency)}</td>
                    <td className="num tnum">{formatMoney(l.amountBase, 'INR')}</td>
                  </tr>
                ))}
              </tbody>
              {hasTotal && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={5} className="num">
                      Grand total (INR)
                    </th>
                    <td className="num tnum">
                      <strong>{formatMoney(total, 'INR')}</strong>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <h3 className="section">Normalisation</h3>
          <dl className="kv wide">
            <dt>Currency</dt>
            <dd>
              {t.currency}
              {t.fxRate != null && <span className="muted tnum"> · 1 {t.currency} = {formatNumber(t.fxRate)} INR</span>}
            </dd>
            <dt>Unit</dt>
            <dd>{t.unit ? `${t.unit}${t.baseUnit ? ` → ${t.baseUnit}` : ''}` : '—'}</dd>
            <dt>Price per base unit</dt>
            <dd className="tnum">{t.unitPriceBase != null ? formatMoney(t.unitPriceBase, 'INR') : '—'}</dd>
            <dt>Tax breakdown</dt>
            <dd className="muted">Not captured by the current ingestion schema</dd>
          </dl>
          {t.warnings.length > 0 && (
            <div className="chips" aria-label="Normalisation warnings">
              {t.warnings.map((w) => (
                <Pill key={w} tone="warn" glyph="⚠">
                  {w.replace(/_/g, ' ').toLowerCase()}
                </Pill>
              ))}
            </div>
          )}

          <h3 className="section">Original source</h3>
          <button className="btn btn-ghost" aria-expanded={showRaw} onClick={() => setShowRaw((s) => !s)} disabled={!raw}>
            {showRaw ? 'Hide' : 'View'} raw source payload{raw ? ` (row ${raw.rowNumber})` : ''}
          </button>
          {showRaw && raw && <pre className="payload">{JSON.stringify(raw.payload, null, 2)}</pre>}
        </>
      )}
    </Drawer>
  );
}
