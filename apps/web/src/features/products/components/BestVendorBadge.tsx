import { formatMoney } from '../../../shared/lib/format';
import { Pill } from '../../../shared/ui/Pill';
import type { ProductIntelligence } from '../types';

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-bar">
      <span className="small">{label}</span>
      <span className="bar" role="meter" aria-label={`${label} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
        <span style={{ width: `${value}%` }} />
      </span>
      <span className="tnum small">{Math.round(value)}</span>
    </div>
  );
}

/** Highlights the optimal supplier for the item (composite of price, price stability and a reliability proxy). */
export function BestVendorBadge({ data }: { data: ProductIntelligence }) {
  const best = data.bestVendor;
  if (!best) {
    return <p className="note-box">No supplier prices are recorded for this product yet, so a best-performing vendor cannot be determined.</p>;
  }
  const s = best.savings;
  return (
    <section className="best-vendor" aria-label="Best-performing vendor">
      <div className="best-head">
        <span className="best-crown" aria-hidden="true">
          ★
        </span>
        <div>
          <span className="hero-label">Best-performing supplier</span>
          <h3>{best.vendorName}</h3>
          <span className="muted small">
            {best.onlySupplier ? 'Only supplier on record' : `Ranked 1 of ${data.vendors.length}`}
            {best.isCurrentSupplier ? ' · current supplier' : ''}
          </span>
        </div>
        <div className="best-score" aria-label={`Composite score ${best.score} out of 100`}>
          <strong className="tnum">{Math.round(best.score)}</strong>
          <span className="muted small">/ 100</span>
        </div>
      </div>
      <div className="best-bars">
        <Bar label="Price (50%)" value={best.breakdown.price} />
        <Bar label="Stability (25%)" value={best.breakdown.stability} />
        <Bar label="Reliability (25%)" value={best.breakdown.reliability} />
      </div>
      {s ? (
        <p className="callout-save" role="note">
          <Pill tone="ok" glyph="▼">
            Save {s.pct.toFixed(1)}%
          </Pill>{' '}
          <strong>{s.cheapestVendorName}</strong> quotes <span className="tnum">{formatMoney(s.perUnit)}</span> per {data.product.baseUnit} less than your current price
          {s.onHistoricalVolume > 0 && (
            <>
              {' '}
              (≈ <span className="tnum">{formatMoney(s.onHistoricalVolume)}</span> on purchases to date).
            </>
          )}
        </p>
      ) : data.summary.currentPrice ? (
        <p className="callout-ok" role="note">
          <Pill tone="ok" glyph="✓">
            Best price
          </Pill>{' '}
          Your current price is already the lowest available among known suppliers.
        </p>
      ) : null}
      <p className="muted small">Reliability is a proxy (purchase history depth and recency); delivery performance is not captured by the ingested sources.</p>
    </section>
  );
}
