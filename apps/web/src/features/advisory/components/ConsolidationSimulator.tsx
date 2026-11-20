import { useId, useMemo, useState } from 'react';
import { formatMoney, formatNumber } from '../../../shared/lib/format';
import { ChangePill } from '../../../shared/ui/Indicators';

interface VendorRow {
  vendorId: string;
  vendorName: string;
  quantity: number;
  spend: number;
  latestPrice: number;
  sharePct: number | null;
}

interface Props {
  productName: string;
  baseUnit: string;
  vendors: VendorRow[];
  bestVendorId: string;
}

/**
 * What-if: move the whole recent volume to one supplier at that supplier's latest price. The optional volume discount is
 * YOUR assumption (the data contains none), so it defaults to 0% and is labelled as such.
 */
export function ConsolidationSimulator({ productName, baseUnit, vendors, bestVendorId }: Props) {
  const selectId = useId();
  const discountId = useId();
  const [target, setTarget] = useState(bestVendorId);
  const [discount, setDiscount] = useState('0');

  const sim = useMemo(() => {
    const t = vendors.find((v) => v.vendorId === target) ?? vendors[0]!;
    const d = Math.min(50, Math.max(0, Number(discount) || 0));
    const qty = vendors.reduce((n, v) => n + v.quantity, 0);
    const current = vendors.reduce((n, v) => n + v.spend, 0);
    const unit = t.latestPrice * (1 - d / 100);
    const simulated = qty * unit;
    return { t, d, qty, current, unit, simulated, saving: current - simulated };
  }, [vendors, target, discount]);

  return (
    <section className="simulator" aria-label="Spend consolidation simulator">
      <h4 className="subhead">Consolidation simulator</h4>
      <p className="muted small">
        Moves all {formatNumber(sim.qty)} {baseUnit} of {productName} bought in the period to one supplier at their latest price.
      </p>
      <div className="sim-controls">
        <label htmlFor={selectId}>Consolidate with</label>
        <select id={selectId} value={target} onChange={(e) => setTarget(e.target.value)}>
          {vendors.map((v) => (
            <option key={v.vendorId} value={v.vendorId}>
              {v.vendorName} ({formatMoney(v.latestPrice)}/{baseUnit})
            </option>
          ))}
        </select>
        <label htmlFor={discountId}>Volume discount you expect (%)</label>
        <input id={discountId} type="number" min={0} max={50} step={0.5} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        <span className="muted small">Your assumption, not from your data.</span>
      </div>
      <div className="sim-result">
        <div>
          <span className="hero-label">Current spend</span>
          <strong className="tnum">{formatMoney(sim.current)}</strong>
        </div>
        <div>
          <span className="hero-label">Simulated spend</span>
          <strong className="tnum">{formatMoney(sim.simulated)}</strong>
          <span className="muted small tnum">
            {formatMoney(sim.unit)} / {baseUnit}
          </span>
        </div>
        <div>
          <span className="hero-label">{sim.saving >= 0 ? 'Saving' : 'Extra cost'}</span>
          <strong className="tnum">{formatMoney(Math.abs(sim.saving))}</strong>
          <ChangePill pct={sim.current > 0 ? -Math.round((sim.saving / sim.current) * 1000) / 10 : null} />
        </div>
      </div>
      <div className="table-wrap">
        <table className="grid compact">
          <caption className="sr-only">Current split of volume by supplier</caption>
          <thead>
            <tr>
              <th scope="col">Supplier</th>
              <th scope="col" className="num">
                Quantity
              </th>
              <th scope="col" className="num">
                Spend
              </th>
              <th scope="col" className="num">
                Latest / {baseUnit}
              </th>
              <th scope="col" className="num">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.vendorId} className={v.vendorId === target ? 'highlight' : ''}>
                <td>{v.vendorName}</td>
                <td className="num tnum">
                  {formatNumber(v.quantity)} {baseUnit}
                </td>
                <td className="num tnum">{formatMoney(v.spend)}</td>
                <td className="num tnum">{formatMoney(v.latestPrice)}</td>
                <td className="num tnum">{v.sharePct != null ? `${v.sharePct}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
