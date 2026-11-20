import { formatDate, formatMoney } from '../../../shared/lib/format';
import { Pill } from '../../../shared/ui/Pill';
import { StabilityPill } from '../display';
import type { ProductComparison, SupplierRow } from '../types';

function Delta({ row, baselineMode }: { row: SupplierRow; baselineMode: boolean }) {
  if (baselineMode) {
    if (row.isBaseline) return <Pill tone="neutral" glyph="◆">This vendor</Pill>;
    const d = row.deltaVsBaselinePct;
    if (d == null) return <span className="muted">—</span>;
    if (d === 0) return <Pill glyph="＝">Same price</Pill>;
    return d < 0 ? (
      <Pill tone="ok" glyph="▼">
        <span className="tnum">{Math.abs(d).toFixed(1)}%</span> cheaper
      </Pill>
    ) : (
      <Pill tone="bad" glyph="▲">
        <span className="tnum">{d.toFixed(1)}%</span> costlier
      </Pill>
    );
  }
  if (row.isCheapest) return <Pill tone="ok" glyph="★">Lowest price</Pill>;
  return row.deltaVsCheapestPct == null ? (
    <span className="muted">—</span>
  ) : (
    <Pill tone="neutral" glyph="▲">
      <span className="tnum">+{row.deltaVsCheapestPct.toFixed(1)}%</span> vs lowest
    </Pill>
  );
}

/**
 * Side-by-side supplier comparison for one canonical product. When the list contains a baseline vendor
 * ("this vendor") the delta column shows how much cheaper/costlier each alternative is; otherwise it is relative to the lowest price.
 */
export function ComparisonTable({ comparison }: { comparison: ProductComparison }) {
  const { product, suppliers } = comparison;
  const baselineMode = suppliers.some((s) => s.isBaseline);
  return (
    <div className="table-wrap">
      <table className="grid compact">
        <caption className="sr-only">Suppliers for {product.name}, ranked by latest price per {product.baseUnit}</caption>
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Supplier</th>
            <th scope="col" className="num">
              Latest price / {product.baseUnit}
            </th>
            <th scope="col" className="num">
              Avg · Range
            </th>
            <th scope="col">Price stability</th>
            <th scope="col" className="num" title="Lead times are not captured by the ingestion sources yet">
              Lead time
            </th>
            <th scope="col">{baselineMode ? 'vs this vendor' : 'vs lowest'}</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={`${s.vendorId}-${s.productId}`} className={s.isBaseline ? 'highlight' : ''}>
              <td className="num tnum">{s.rank}</td>
              <td>
                <strong>{s.vendorName}</strong>
                {s.matchType === 'similar' && (
                  <span className="chip block-chip" title={`Substitute product, ${Math.round(s.similarity * 100)}% name match`}>
                    Similar: {s.productName} ({Math.round(s.similarity * 100)}%)
                  </span>
                )}
              </td>
              <td className="num tnum">
                {formatMoney(s.lastPrice)}
                <span className="muted block small">
                  {s.lastPriceKind === 'purchase' ? 'purchased' : 'quoted'} {formatDate(s.lastDate)}
                </span>
              </td>
              <td className="num tnum muted">
                {formatMoney(s.avgPrice)}
                <span className="block small">
                  {formatMoney(s.minPrice)}–{formatMoney(s.maxPrice)} · {s.pricePoints} pts
                </span>
              </td>
              <td>
                <StabilityPill rating={s.stability} />
                {s.volatilityCv != null && <span className="muted small tnum"> CV {(s.volatilityCv * 100).toFixed(1)}%</span>}
              </td>
              <td className="num muted">—</td>
              <td>
                <Delta row={s} baselineMode={baselineMode} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
