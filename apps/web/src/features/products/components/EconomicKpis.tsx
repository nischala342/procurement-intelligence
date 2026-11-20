import { formatDate, formatMoney, formatNumber } from '../../../shared/lib/format';
import { ChangePill, StabilityPill } from '../../../shared/ui/Indicators';
import { Pill } from '../../../shared/ui/Pill';
import type { ProductIntelligence } from '../types';

const TREND = { rising: { glyph: '▲', tone: 'bad', label: 'Rising' }, falling: { glyph: '▼', tone: 'ok', label: 'Falling' }, flat: { glyph: '＝', tone: 'neutral', label: 'Flat' }, insufficient_data: { glyph: '○', tone: 'neutral', label: 'Not enough data' } } as const;

export function EconomicKpis({ data }: { data: ProductIntelligence }) {
  const { summary, lowestPurchase, priceComparison, consumption, fluctuation } = data;
  const unit = data.product.baseUnit;
  const cur = summary.currentPrice;
  const trend = TREND[fluctuation.trend];
  return (
    <div className="hero-grid">
      <section className="hero" aria-label="Lowest recorded price versus current price">
        <span className="hero-label">Lowest paid vs current</span>
        <strong className="hero-value tnum">{lowestPurchase ? formatMoney(lowestPurchase.price) : '—'}</strong>
        <span className="muted small">
          {lowestPurchase ? `${lowestPurchase.vendorName ?? 'Unknown'} · ${formatDate(lowestPurchase.date)}` : 'No purchases recorded'}
        </span>
        <span className="hero-row">
          <span className="tnum">
            Now <strong>{cur ? formatMoney(cur.price) : '—'}</strong>
          </span>
          {cur?.kind === 'quote' && <span className="muted small">(quote)</span>}
          <ChangePill pct={priceComparison.currentVsLowestPct} />
        </span>
      </section>

      <section className="hero" aria-label="Average purchase price">
        <span className="hero-label">Average purchase price</span>
        <strong className="hero-value tnum">{summary.weightedAvgPurchasePrice != null ? formatMoney(summary.weightedAvgPurchasePrice) : '—'}</strong>
        <span className="muted small tnum">
          per {unit} · quantity-weighted{summary.meanPurchasePrice != null ? ` · simple mean ${formatMoney(summary.meanPurchasePrice)}` : ''}
        </span>
        <span className="hero-row">
          <span className="muted small">Current vs average</span>
          <ChangePill pct={priceComparison.currentVsAveragePct} />
        </span>
      </section>

      <section className="hero" aria-label="Consumption velocity">
        <span className="hero-label">Consumption velocity</span>
        <strong className="hero-value tnum">{consumption ? `${formatNumber(consumption.velocityPerMonth)} ${unit}/mo` : '—'}</strong>
        <span className="muted small tnum">
          {consumption
            ? `${formatNumber(consumption.velocityPerDay)} ${unit}/day · avg order ${formatNumber(consumption.avgOrderQty)} ${unit} every ${Math.round(consumption.avgDaysBetweenOrders)} days`
            : 'Needs two purchases on different dates'}
        </span>
        <span className="muted small">Estimated from purchase volume</span>
      </section>

      <section className="hero" aria-label="Price trend">
        <span className="hero-label">Price trend</span>
        <strong className="hero-value tnum">{fluctuation.avgMonthOverMonthPct != null ? `${fluctuation.avgMonthOverMonthPct > 0 ? '+' : ''}${fluctuation.avgMonthOverMonthPct}% / mo` : '—'}</strong>
        <span className="hero-row">
          <Pill tone={trend.tone} glyph={trend.glyph}>
            {trend.label}
          </Pill>
          <StabilityPill rating={fluctuation.stability.rating} />
        </span>
        <span className="muted small tnum">
          {fluctuation.changePct != null ? `${fluctuation.changePct > 0 ? '+' : ''}${fluctuation.changePct}% overall` : 'Single period'}
          {fluctuation.rangePct != null ? ` · range ${fluctuation.rangePct}%` : ''}
        </span>
      </section>
    </div>
  );
}
