import { formatDate, formatMoney, formatNumber } from '../../../shared/lib/format';
import { Pill } from '../../../shared/ui/Pill';
import { Sparkline } from '../../../shared/ui/Sparkline';
import { ChangePill } from '../display';
import type { CatalogProduct, PriceSeries } from '../types';

export function CatalogTable({ products, series }: { products: CatalogProduct[]; series: PriceSeries[] }) {
  const byProduct = new Map(series.map((s) => [s.productId, s]));
  return (
    <div className="table-wrap">
      <table className="grid compact">
        <caption className="sr-only">Products supplied with latest versus historical pricing (base currency per base unit)</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="num">
              Units supplied
            </th>
            <th scope="col" className="num">
              Spend
            </th>
            <th scope="col" className="num">
              Latest price
            </th>
            <th scope="col" className="num">
              Avg · Min–Max
            </th>
            <th scope="col">Change since first</th>
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const s = byProduct.get(p.productId);
            return (
              <tr key={p.productId}>
                <td>
                  <strong>{p.name}</strong>
                  {p.sku && <span className="muted block small tnum">{p.sku}</span>}
                </td>
                <td className="num tnum">{p.unitsSupplied > 0 ? `${formatNumber(p.unitsSupplied)} ${p.baseUnit}` : <span className="muted">—</span>}</td>
                <td className="num tnum">{p.totalSpend > 0 ? formatMoney(p.totalSpend) : <span className="muted">—</span>}</td>
                <td className="num tnum">
                  {formatMoney(p.lastPrice)}
                  <span className="muted block small">
                    / {p.baseUnit} · {p.lastPriceKind === 'purchase' ? 'purchased' : 'quoted'} {formatDate(p.lastDate)}
                  </span>
                </td>
                <td className="num tnum muted">
                  {formatMoney(p.avgPrice)}
                  <span className="block small">
                    {formatMoney(p.minPrice)}–{formatMoney(p.maxPrice)}
                  </span>
                </td>
                <td>
                  <ChangePill pct={p.priceChangePct} />
                  <span className="muted small tnum"> {p.pricePoints} pts</span>
                  {p.volatilityCv != null && p.volatilityCv >= 0.15 && (
                    <>
                      {' '}
                      <Pill tone="bad" glyph="↯">
                        Volatile
                      </Pill>
                    </>
                  )}
                </td>
                <td>
                  <Sparkline values={(s?.points ?? []).map((pt) => pt.avgPrice)} label={`${p.name} price trend`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
