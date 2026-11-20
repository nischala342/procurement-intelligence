import { formatDate, formatMoney } from '../../../shared/lib/format';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { StabilityPill } from '../../../shared/ui/Indicators';
import { Pill } from '../../../shared/ui/Pill';
import type { Alternatives, SupplierRow } from '../types';

function Delta({ pct, baseline }: { pct: number | null; baseline: boolean }) {
  if (baseline) return <Pill glyph="◆">Current</Pill>;
  if (pct == null) return <span className="muted">—</span>;
  if (pct === 0) return <Pill glyph="＝">Same price</Pill>;
  return pct < 0 ? (
    <Pill tone="ok" glyph="▼">
      <span className="tnum">{Math.abs(pct).toFixed(1)}%</span> cheaper
    </Pill>
  ) : (
    <Pill tone="bad" glyph="▲">
      <span className="tnum">{pct.toFixed(1)}%</span> costlier
    </Pill>
  );
}

function VendorRows({ rows, unit }: { rows: SupplierRow[]; unit: string }) {
  return (
    <div className="table-wrap">
      <table className="grid compact">
        <caption className="sr-only">Alternative suppliers for this product ranked by latest price per {unit}</caption>
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Supplier</th>
            <th scope="col" className="num">
              Latest / {unit}
            </th>
            <th scope="col">Price stability</th>
            <th scope="col" className="num" title="Lead times are not captured by the ingestion sources yet">
              Lead time
            </th>
            <th scope="col">vs current</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.vendorId} className={s.isBaseline ? 'highlight' : ''}>
              <td className="num tnum">{s.rank}</td>
              <td>
                <strong>{s.vendorName}</strong>
              </td>
              <td className="num tnum">
                {formatMoney(s.lastPrice)}
                <span className="muted block small">
                  {s.lastPriceKind === 'purchase' ? 'purchased' : 'quoted'} {formatDate(s.lastDate)}
                </span>
              </td>
              <td>
                <StabilityPill rating={s.stability} />
              </td>
              <td className="num muted">—</td>
              <td>
                <Delta pct={s.deltaVsBaselinePct} baseline={s.isBaseline} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Alternative approved vendors for the same item, plus substitute products, ranked by price competitiveness. */
export function AlternativesPanel({ alternatives, unit }: { alternatives: Alternatives; unit: string }) {
  const { vendors, substitutes, baselineVendor } = alternatives;
  const hasOthers = vendors.some((v) => !v.isBaseline) || vendors.length > 1;
  return (
    <>
      <h4 className="subhead">Same product, other suppliers</h4>
      {vendors.length === 0 || (!hasOthers && !baselineVendor) ? (
        <EmptyState title="No supplier prices yet" hint="Ingest supplier price lists or invoices for this product to compare vendors." />
      ) : vendors.length === 1 ? (
        <p className="muted">Only one supplier is on record for this product. Ingest other suppliers' price lists to compare.</p>
      ) : (
        <VendorRows rows={vendors} unit={unit} />
      )}

      <h4 className="subhead">Substitute products</h4>
      {substitutes.length === 0 ? (
        <p className="muted">No similar products with the same unit were found in your catalog.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid compact">
            <caption className="sr-only">Substitute products ranked by cheapest supplier price per {unit}</caption>
            <thead>
              <tr>
                <th scope="col">Substitute</th>
                <th scope="col">Name match</th>
                <th scope="col">Cheapest supplier</th>
                <th scope="col" className="num">
                  Price / {unit}
                </th>
                <th scope="col">vs current</th>
              </tr>
            </thead>
            <tbody>
              {substitutes.map((s) => (
                <tr key={s.product.id}>
                  <td>
                    <strong>{s.product.name}</strong>
                    <span className="muted block small">{s.suppliers.length} supplier{s.suppliers.length === 1 ? '' : 's'}</span>
                  </td>
                  <td className="tnum">{Math.round(s.product.similarity * 100)}%</td>
                  <td>{s.cheapestVendor ?? '—'}</td>
                  <td className="num tnum">{s.cheapestPrice != null ? formatMoney(s.cheapestPrice) : '—'}</td>
                  <td>
                    <Delta pct={s.deltaVsCurrentPct} baseline={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
