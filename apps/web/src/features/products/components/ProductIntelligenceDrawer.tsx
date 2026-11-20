import { Drawer } from '../../../shared/ui/Drawer';
import { Pill } from '../../../shared/ui/Pill';
import { ChangePill } from '../../../shared/ui/Indicators';
import { formatMoney } from '../../../shared/lib/format';
import { useProductIntelligence } from '../hooks';
import { AlternativesPanel } from './AlternativesPanel';
import { BestVendorBadge } from './BestVendorBadge';
import { EconomicKpis } from './EconomicKpis';
import { PriceHistoryChart } from './PriceHistoryChart';
import { ReorderAdvisoryCard } from './ReorderAdvisoryCard';
import { SupplierMatrix } from './SupplierMatrix';

export function ProductIntelligenceDrawer({ product, onClose }: { product: { id: string; name: string } | null; onClose: () => void }) {
  const q = useProductIntelligence(product?.id ?? null);
  const data = q.data;

  return (
    <Drawer
      open={Boolean(product)}
      onClose={onClose}
      width={1000}
      title={product?.name || data?.product.name || ''}
      subtitle={data ? `${data.product.sku ? `SKU ${data.product.sku} · ` : ''}prices in ${data.currency} per ${data.product.baseUnit}` : 'Product economics'}
    >
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof Error ? q.error.message : 'Failed to load product intelligence'}
        </p>
      )}
      {q.isPending && (
        <div aria-busy="true" aria-label="Loading product intelligence">
          <div className="hero-grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="hero">
                <span className="skeleton" style={{ width: '55%' }} />
                <span className="skeleton" style={{ width: '80%', height: 22 }} />
                <span className="skeleton" style={{ width: '65%' }} />
              </div>
            ))}
          </div>
          <span className="skeleton" style={{ width: '100%', height: 240, marginTop: 16 }} />
        </div>
      )}

      {data && (
        <>
          <BestVendorBadge data={data} />
          <EconomicKpis data={data} />
          {data.summary.purchaseLines === 0 && (
            <p className="note-box">No purchases are recorded for this product yet. Prices shown come from supplier quotes; spend, average paid price and consumption need invoices.</p>
          )}

          <h3 className="section">Price history</h3>
          <PriceHistoryChart points={data.history.points} baseUnit={data.product.baseUnit} lowestPurchase={data.lowestPurchase?.price ?? null} weightedAvg={data.summary.weightedAvgPurchasePrice} />
          {data.history.truncated && <p className="muted small">Showing the most recent 500 observations.</p>}

          {data.fluctuation.monthly.length > 0 && (
            <>
              <h3 className="section">
                Price fluctuation
                <span className="section-actions muted small">
                  {data.fluctuation.basis === 'purchases' ? 'Based on purchases' : 'Based on all price observations (fewer than two purchase months)'}
                </span>
              </h3>
              <div className="table-wrap">
                <table className="grid compact">
                  <caption className="sr-only">Monthly average unit price and month-over-month change</caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col" className="num">
                        Avg price / {data.product.baseUnit}
                      </th>
                      <th scope="col">Change vs previous month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fluctuation.monthly.map((m) => (
                      <tr key={m.period}>
                        <td className="tnum">{m.period}</td>
                        <td className="num tnum">{formatMoney(m.avgPrice)}</td>
                        <td>{m.changePct == null ? <span className="muted">First recorded month</span> : <ChangePill pct={m.changePct} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">
                Gaps between recorded months are converted to a per-month rate.{' '}
                {data.fluctuation.volatilityCv != null && (
                  <>
                    Price variation (CV) <span className="tnum">{(data.fluctuation.volatilityCv * 100).toFixed(1)}%</span>.
                  </>
                )}
              </p>
            </>
          )}

          <h3 className="section">Reorder recommendation</h3>
          <ReorderAdvisoryCard data={data} />

          <h3 className="section">
            Supplier comparison
            <Pill tone="neutral">
              {data.vendors.length} supplier{data.vendors.length === 1 ? '' : 's'}
            </Pill>
          </h3>
          <SupplierMatrix data={data} />

          <h3 className="section">Alternative products &amp; suppliers</h3>
          <AlternativesPanel alternatives={data.alternatives} unit={data.product.baseUnit} />

          {data.dataQuality.purchaseLinesWithoutQuantity > 0 && (
            <p className="warn-text small" role="note">
              {data.dataQuality.purchaseLinesWithoutQuantity} purchase line(s) have no quantity and are excluded from weighted averages and consumption.
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}
