import { formatDate, formatMoney } from '../../../shared/lib/format';
import { StabilityPill } from '../../../shared/ui/Indicators';
import { Pill } from '../../../shared/ui/Pill';
import type { ProductIntelligence } from '../types';

/** Side-by-side supplier scorecard for this product: composite score and its components, latest price, stability. */
export function SupplierMatrix({ data }: { data: ProductIntelligence }) {
  const unit = data.product.baseUnit;
  if (!data.vendors.length) return <p className="muted">No supplier prices recorded for this product yet.</p>;
  const minPrice = Math.min(...data.vendors.map((v) => v.lastPrice));
  return (
    <div className="table-wrap">
      <table className="grid compact">
        <caption className="sr-only">Supplier scorecard for {data.product.name}, ranked by composite score</caption>
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Supplier</th>
            <th scope="col" className="num">
              Score
            </th>
            <th scope="col" className="num" title="100 = lowest latest price">
              Price
            </th>
            <th scope="col" className="num">
              Stability
            </th>
            <th scope="col" className="num" title="Proxy: purchase history depth and recency">
              Reliability*
            </th>
            <th scope="col" className="num">
              Latest / {unit}
            </th>
            <th scope="col" className="num">
              Avg · Range
            </th>
            <th scope="col">Price stability</th>
          </tr>
        </thead>
        <tbody>
          {data.vendors.map((v) => (
            <tr key={v.vendorId} className={v.rank === 1 ? 'highlight' : ''}>
              <td className="num tnum">{v.rank}</td>
              <td>
                <strong>{v.vendorName}</strong>
                <span className="block">
                  {v.isCurrentSupplier && <Pill glyph="◆">Current supplier</Pill>} {v.lastPrice === minPrice && data.vendors.length > 1 && (
                    <Pill tone="ok" glyph="★">
                      Lowest price
                    </Pill>
                  )}
                </span>
              </td>
              <td className="num tnum">
                <strong>{Math.round(v.score)}</strong>
              </td>
              <td className="num tnum">{Math.round(v.breakdown.price)}</td>
              <td className="num tnum">{Math.round(v.breakdown.stability)}</td>
              <td className="num tnum">{Math.round(v.breakdown.reliability)}</td>
              <td className="num tnum">
                {formatMoney(v.lastPrice)}
                <span className="muted block small">
                  {v.lastPriceKind === 'purchase' ? 'purchased' : 'quoted'} {formatDate(v.lastDate)}
                </span>
              </td>
              <td className="num tnum muted">
                {formatMoney(v.avgPrice)}
                <span className="block small">
                  {formatMoney(v.minPrice)}–{formatMoney(v.maxPrice)} · {v.pricePoints} pts ({v.purchaseCount} bought)
                </span>
              </td>
              <td>
                <StabilityPill rating={v.stability} />
                {v.volatilityCv != null && <span className="muted small tnum"> CV {(v.volatilityCv * 100).toFixed(1)}%</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small table-note">*Reliability is a proxy built from purchase history depth and recency. Lead times and delivery performance are not captured.</p>
    </div>
  );
}
