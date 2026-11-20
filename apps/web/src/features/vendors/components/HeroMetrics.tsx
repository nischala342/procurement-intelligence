import { formatMoney } from '../../../shared/lib/format';
import { FrequencyPill, StabilityPill } from '../display';
import type { VendorIntelligence } from '../types';

export function HeroMetrics({ data }: { data: VendorIntelligence }) {
  const { summary, frequency, priceConsistency } = data;
  return (
    <div className="hero-grid">
      <section className="hero" aria-label="Total spend">
        <span className="hero-label">Total spend</span>
        <strong className="hero-value tnum">{formatMoney(summary.totalSpend)}</strong>
        <span className="muted small tnum">
          {summary.orderCount} order{summary.orderCount === 1 ? '' : 's'} · {formatMoney(summary.totalPaid)} paid
        </span>
      </section>
      <section className="hero" aria-label="Average order value">
        <span className="hero-label">Avg order value</span>
        <strong className="hero-value tnum">{summary.avgOrderValue != null ? formatMoney(summary.avgOrderValue) : '—'}</strong>
        <span className="muted small tnum">
          {summary.productCount} product{summary.productCount === 1 ? '' : 's'} supplied
        </span>
      </section>
      <section className="hero" aria-label="Price stability index">
        <span className="hero-label">Price stability index</span>
        <strong className="hero-value tnum">
          {priceConsistency.stabilityIndex ?? '—'}
          {priceConsistency.stabilityIndex != null && <span className="hero-unit"> / 100</span>}
        </strong>
        <span>
          <StabilityPill rating={priceConsistency.rating} />
          {priceConsistency.volatilityCv != null && <span className="muted small tnum"> CV {(priceConsistency.volatilityCv * 100).toFixed(1)}%</span>}
        </span>
      </section>
      <section className="hero" aria-label="Purchase cadence">
        <span className="hero-label">Purchase cadence</span>
        <strong className="hero-value tnum">{frequency.avgDaysBetweenOrders != null ? `Every ${Math.round(frequency.avgDaysBetweenOrders)} days` : '—'}</strong>
        <span>
          <FrequencyPill status={frequency.status} />
          {summary.daysSinceLastPurchase != null && <span className="muted small tnum"> · last {summary.daysSinceLastPurchase}d ago</span>}
        </span>
      </section>
    </div>
  );
}
