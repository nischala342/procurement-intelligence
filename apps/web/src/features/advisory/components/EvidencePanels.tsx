import { formatDate, formatMoney, formatNumber } from '../../../shared/lib/format';
import { Pill } from '../../../shared/ui/Pill';
import type { InsightDetail } from '../types';
import { ConsolidationSimulator } from './ConsolidationSimulator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type E = Record<string, any>;
const day = (iso?: string | null) => (iso ? formatDate(iso) : '—');

export const ProductLink = ({ id, name }: { id: string; name: string }) => (
  <a href={`#/products?open=${id}`} className="link">
    {name}
  </a>
);
export const VendorLink = ({ id, name }: { id: string; name: string }) => (
  <a href={`#/vendors?open=${id}`} className="link">
    {name}
  </a>
);

function Kv({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="kv wide">
      {rows.map(([k, v]) => (
        <div key={k} className="kv-row">
          <dt>{k}</dt>
          <dd className="tnum">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function CostCreep({ e }: { e: E }) {
  if (e.scope === 'portfolio') {
    return (
      <>
        <Kv rows={[['Window', `${e.windowDays} days vs the ${e.windowDays} days before`], ['Products compared', e.productCount], ['Spend-weighted change', `+${e.weightedChangePct}%`], ['Extra cost at recent volumes', e.impactAmountInr != null ? formatMoney(e.impactAmountInr) : 'Not estimated']]} />
        <div className="table-wrap">
          <table className="grid compact">
            <caption className="sr-only">Products contributing most to the increase</caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className="num">
                  Change
                </th>
                <th scope="col" className="num">
                  Recent spend
                </th>
              </tr>
            </thead>
            <tbody>
              {(e.topProducts as E[]).map((p) => (
                <tr key={p.productId}>
                  <td>
                    <ProductLink id={p.productId} name={p.productName} />
                  </td>
                  <td className="num tnum">+{p.changePct}%</td>
                  <td className="num tnum">{formatMoney(p.recentSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }
  const row = (label: string, w: E) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      <td className="tnum">
        {day(w.from)} – {day(w.to)}
      </td>
      <td className="num tnum">{formatMoney(w.avgPrice)}</td>
      <td className="num tnum">{w.purchaseLines}</td>
      <td className="num tnum">{w.quantity != null ? `${formatNumber(w.quantity)} ${e.baseUnit}` : '—'}</td>
      <td className="num tnum">{formatMoney(w.spend)}</td>
    </tr>
  );
  return (
    <>
      <div className="table-wrap">
        <table className="grid compact">
          <caption className="sr-only">Average price paid in the recent and prior windows</caption>
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col">Dates</th>
              <th scope="col" className="num">
                Avg price / {e.baseUnit}
              </th>
              <th scope="col" className="num">
                Purchase lines
              </th>
              <th scope="col" className="num">
                Quantity
              </th>
              <th scope="col" className="num">
                Spend
              </th>
            </tr>
          </thead>
          <tbody>
            {row('Recent', e.recent)}
            {row('Prior', e.prior)}
          </tbody>
        </table>
      </div>
      <Kv rows={[['Change', `+${e.changePct}% (${formatMoney(e.priceIncreasePerUnit)} per ${e.baseUnit})`], ['Windows evaluated', `${(e.windowsEvaluated as number[]).join(', ')} days; strongest shown`], ['Suppliers in the recent window', (e.vendors as E[]).map((v) => <VendorLink key={v.vendorId} id={v.vendorId} name={v.vendorName} />).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ', ', x] : [x]), [])]]} />
    </>
  );
}

function Variance({ e }: { e: E }) {
  return (
    <>
      <Kv
        rows={[
          ['Supplier you pay', <VendorLink key="v" id={e.vendor.vendorId} name={e.vendor.vendorName} />],
          ['Latest price paid', `${formatMoney(e.vendor.latestPurchasePrice)} / ${e.baseUnit} on ${day(e.vendor.latestPurchaseDate)}`],
          ['Cheaper supplier', <VendorLink key="p" id={e.peer.vendorId} name={e.peer.vendorName} />],
          ['Their latest price', `${formatMoney(e.peer.price)} / ${e.baseUnit} (${e.peer.priceKind === 'purchase' ? 'purchased' : 'quoted'} ${day(e.peer.date)})`],
          ['Premium', `${e.premiumPct}% (${formatMoney(e.premiumPerUnit)} per ${e.baseUnit})`],
          ['Consistency', e.comparison.monthsCompared >= 2 ? `Higher in ${e.comparison.monthsHigher} of ${e.comparison.monthsCompared} comparable months` : 'Only one comparable period'],
          ['Bought in look-back', e.vendor.quantity != null ? `${formatNumber(e.vendor.quantity)} ${e.baseUnit} over ${e.lookbackDays} days (${formatMoney(e.vendor.spend)})` : '—'],
        ]}
      />
      <h4 className="subhead">All suppliers' latest prices</h4>
      <div className="table-wrap">
        <table className="grid compact">
          <caption className="sr-only">Latest price per supplier for this product</caption>
          <thead>
            <tr>
              <th scope="col">Supplier</th>
              <th scope="col" className="num">
                Latest / {e.baseUnit}
              </th>
              <th scope="col">Type</th>
              <th scope="col">Date</th>
            </tr>
          </thead>
          <tbody>
            {(e.suppliers as E[]).map((s) => (
              <tr key={s.vendorId} className={s.vendorId === e.vendor.vendorId ? 'highlight' : ''}>
                <td>
                  <VendorLink id={s.vendorId} name={s.vendorName} />
                </td>
                <td className="num tnum">{formatMoney(s.latestPrice)}</td>
                <td>{s.priceKind === 'purchase' ? 'Purchased' : 'Quoted'}</td>
                <td className="tnum">{day(s.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Consolidation({ e }: { e: E }) {
  if (e.scope === 'category') return <CategoryConsolidation e={e} />;
  return (
    <>
      <Kv rows={[['Suppliers', e.vendorCount], ['Period', `Last ${e.windowDays} days`], ['Total volume', `${formatNumber(e.totalQuantity)} ${e.baseUnit}`], ['Total spend', formatMoney(e.totalSpend)], ['Largest supplier share', e.topVendorSharePct != null ? `${e.topVendorSharePct}%` : '—'], ['Lowest latest price', `${e.bestVendor.vendorName} at ${formatMoney(e.bestVendor.price)} / ${e.baseUnit}`]]} />
      <ConsolidationSimulator productName={e.productName} baseUnit={e.baseUnit} vendors={e.vendors as never} bestVendorId={e.bestVendor.vendorId} />
    </>
  );
}

function Reorder({ e }: { e: E }) {
  return (
    <>
      <Kv
        rows={[
          ['Estimated stock', `${formatNumber(e.estimatedStock)} ${e.baseUnit}`],
          ['Reorder point', `${formatNumber(e.reorderPoint)} ${e.baseUnit} (incl. ${formatNumber(e.safetyStock)} safety stock, ${String(e.safetyStockMethod).replace(/_/g, ' ')})`],
          ['Days of cover', e.runwayDays != null ? `${formatNumber(e.runwayDays)} days` : '—'],
          ['Lead time', `${e.leadTimeDays} days (${LEAD_LABEL[e.leadTimeSource] ?? e.leadTimeSource})`],
          ['Estimated demand', `${formatNumber(e.velocityPerDay)} ${e.baseUnit}/day from ${e.ordersConsidered} purchases, ${formatNumber(e.avgDaysBetweenOrders)} days apart`],
          ['Last order', `${formatNumber(e.lastOrderQty)} ${e.baseUnit} on ${day(e.lastOrderDate)} (${formatNumber(e.daysSinceLastOrder)} days before the analysis date)`],
          ['Recommended order', `${formatNumber(e.recommendedOrderQty)} ${e.baseUnit}${e.orderByDate ? `, by ${day(e.orderByDate)}` : ''}`],
          ['Order value', formatMoney(e.estimatedOrderValue)],
        ]}
      />
      <ul className="issues">
        {(e.assumptions as string[]).map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </>
  );
}

function Market({ e }: { e: E }) {
  const b = e.benchmark as E;
  return (
    <>
      <section className="provenance" aria-label="Benchmark provenance">
        <Pill tone="ok" glyph="✓">
          Verified benchmark
        </Pill>
        <Kv
          rows={[
            ['Source', b.sourceName],
            ['Link', b.sourceUrl ? <a key="u" className="link" href={b.sourceUrl} target="_blank" rel="noopener noreferrer">{b.sourceUrl}</a> : '—'],
            ['Price observed', `${formatMoney(b.price)} / ${e.baseUnit} on ${day(b.observedAt)} (${b.ageDays} days before the analysis date)`],
            ['Verified by', `${b.verifiedBy ?? '—'}${b.verifiedAt ? ` on ${day(b.verifiedAt)}` : ''}`],
            ['Notes', b.notes ?? '—'],
          ]}
        />
      </section>
      <Kv
        rows={[
          ['You last paid', `${formatMoney(e.paid.latestPrice)} / ${e.baseUnit} on ${day(e.paid.latestDate)}${e.paid.vendorId ? '' : ''}`],
          ['Supplier', e.paid.vendorId ? <VendorLink key="s" id={e.paid.vendorId} name={e.paid.vendorName} /> : e.paid.vendorName],
          ['Difference', `${e.premiumPct}% (${formatMoney(e.premiumPerUnit)} per ${e.baseUnit})`],
          ['Volume in look-back', e.paid.quantity != null ? `${formatNumber(e.paid.quantity)} ${e.baseUnit} over ${e.lookbackDays} days` : '—'],
          ['Gross difference', e.grossSavings != null ? formatMoney(e.grossSavings) : 'Not estimated'],
        ]}
      />
      <p className="muted small">{e.caveat}</p>
    </>
  );
}

// ---------------------------------------------------------------- dataset-driven (purchase-order) insight types

const pctOr = (v: number | null | undefined, d = '—') => (v != null ? `${v}%` : d);
const LEAD_LABEL: Record<string, string> = { configured: 'configured', measured: 'measured: 75th percentile of recent PO lead times', assumed_default: 'assumed default' };

/** Supplier scorecards (composite: price 40 · delivery 30 · risk 15 · ESG & compliance 15). */
function Scorecards({ rows, caption }: { rows: E[]; caption: string }) {
  if (!rows?.length) return null;
  return (
    <div className="table-wrap">
      <table className="grid compact">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Supplier</th>
            <th scope="col" className="num">Score</th>
            <th scope="col" className="num">Price index</th>
            <th scope="col" className="num">On time</th>
            <th scope="col">Risk</th>
            <th scope="col" className="num">ESG</th>
            <th scope="col" className="num">Lines</th>
            <th scope="col" className="num">Spend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.vendorId}>
              <td>
                <VendorLink id={c.vendorId} name={c.vendorName} />
              </td>
              <td className="num tnum">
                <strong>{c.score}</strong>
              </td>
              <td className="num tnum">{c.medianIndex}</td>
              <td className="num tnum">{pctOr(c.onTimePct)}</td>
              <td>{c.riskRating ?? '—'}</td>
              <td className="num tnum">{c.esgScore ?? '—'}</td>
              <td className="num tnum">{c.lines}</td>
              <td className="num tnum">{formatMoney(c.spend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcingShift({ e }: { e: E }) {
  return (
    <>
      <Kv
        rows={[
          ['Category', e.category],
          ['Incumbent', <VendorLink key="i" id={e.incumbent.vendorId} name={e.incumbent.vendorName} />],
          ['Recommended', <VendorLink key="r" id={e.recommended.vendorId} name={e.recommended.vendorName} />],
          ['Price index (item median = 1)', `${e.incumbent.medianIndex} → ${e.recommended.medianIndex}`],
          ['Significance', `${e.test.method}: p = ${e.test.pValue} (${e.test.linesRecommended} vs ${e.test.linesIncumbent} lines; threshold ${e.test.significanceLevel})`],
          ['Incumbent spend, last 12 months', formatMoney(e.incumbentSpend12m)],
          ['Estimated annual saving', e.estimatedAnnualSavings != null ? `${formatMoney(e.estimatedAnnualSavings)} (${e.savingsPct}%)` : 'Not estimated'],
        ]}
      />
      <h4 className="panel-sub">Scorecards</h4>
      <Scorecards rows={[e.incumbent, e.recommended, ...((e.alternatives as E[]) ?? []).filter((a) => a.vendorId !== e.recommended.vendorId)]} caption="Supplier scorecards in this category" />
      <p className="muted small">Price index = price paid ÷ the item&apos;s median price over 24 months, so items of different value can be pooled per category. Thin samples are shrunk toward 1.</p>
    </>
  );
}

function SupplierList({ rows, caption }: { rows: E[]; caption: string }) {
  return (
    <ul className="chip-list" aria-label={caption}>
      {rows.map((s) => (
        <li key={s.vendorId}>
          <VendorLink id={s.vendorId} name={s.vendorName} /> <span className="muted tnum">{s.onTimeRate}% on time · {s.lines} lines</span>
        </li>
      ))}
    </ul>
  );
}

function DeliveryRisk({ e }: { e: E }) {
  if (e.scope === 'vendor') {
    return (
      <Kv
        rows={[
          ['Supplier', <VendorLink key="v" id={e.vendorId} name={e.vendorName} />],
          ['On-time rate', `${e.onTimeRate}% of ${e.lines} lines (95% upper bound ${e.onTimeUpper}%)`],
          ['Your portfolio', `${e.portfolioOnTimeRate}% on time`],
          ['Average days late', e.avgDaysLate != null ? `${e.avgDaysLate} days` : '—'],
          ['Spend, last 12 months', formatMoney(e.spend12m)],
        ]}
      />
    );
  }
  return (
    <>
      <Kv
        rows={[
          ['On-time rate', `${e.onTimeRate}% of ${e.lines} lines (target ${e.targetRate}%)`],
          ['Late lines', `${e.lateLines} lines, ${formatMoney(e.lateSpend)} of spend`],
          ['Median delay', e.medianDaysLate != null ? `${e.medianDaysLate} days` : '—'],
        ]}
      />
      <h4 className="panel-sub">Least reliable</h4>
      <SupplierList rows={e.worstSuppliers} caption="Least reliable suppliers" />
      <h4 className="panel-sub">Most reliable</h4>
      <SupplierList rows={e.bestSuppliers} caption="Most reliable suppliers" />
    </>
  );
}

function Maverick({ e }: { e: E }) {
  return (
    <>
      <Kv
        rows={[
          ['Category', e.category],
          ['Off-contract (maverick) spend', `${formatMoney(e.maverickSpend)} of ${formatMoney(e.categorySpend)} (${e.maverickSharePct}%)`],
          ['Lines', `${e.maverickLines} maverick vs ${e.compliantLines} compliant`],
          ['Median price index', `${e.maverickMedianIndex} maverick vs ${e.compliantMedianIndex ?? '—'} compliant`],
          ['Premium test', e.premiumTest ? `${e.premiumTest.method}: p = ${e.premiumTest.pValue} (${e.premiumTest.significant ? 'significant' : 'not significant'})` : 'Not enough lines to test'],
        ]}
      />
      <h4 className="panel-sub">Where it went</h4>
      <ul className="chip-list" aria-label="Suppliers receiving maverick spend">
        {(e.topVendors as E[]).map((v) => (
          <li key={v.vendorId}>
            <VendorLink id={v.vendorId} name={v.vendorName} /> <span className="muted tnum">{formatMoney(v.spend)} · {v.lines} lines</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Budget({ e }: { e: E }) {
  return (
    <>
      <Kv
        rows={[
          ['Category', e.category],
          ['Lines over budget', `${e.linesOverBudget} of ${e.linesWithBudget} (${e.overBudgetRatePct}%)`],
          ['Overrun', `${formatMoney(e.overrunAmount)} (${e.overrunSharePct}% of ${formatMoney(e.categorySpend)})`],
        ]}
      />
      <div className="table-wrap">
        <table className="grid compact">
          <caption className="sr-only">Items with the largest overrun</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="num">Lines</th>
              <th scope="col" className="num">Overrun</th>
            </tr>
          </thead>
          <tbody>
            {(e.topItems as E[]).map((i) => (
              <tr key={i.productId}>
                <td>
                  <ProductLink id={i.productId} name={i.productName} />
                </td>
                <td className="num tnum">{i.lines}</td>
                <td className="num tnum">{formatMoney(i.overrun)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Overrun = Σ (unit price paid − budget unit price) × quantity, on lines priced above budget.</p>
    </>
  );
}

function SupplyRisk({ e }: { e: E }) {
  return (
    <>
      <Kv
        rows={[
          ['Category', e.category],
          ['Spend with high-risk suppliers', `${formatMoney(e.atRiskSpend)} of ${formatMoney(e.categorySpend)} (${e.atRiskSharePct}%)`],
          ['Single-source lines', e.singleSourceLines],
        ]}
      />
      <h4 className="panel-sub">Exposed suppliers</h4>
      <Scorecards rows={e.riskySuppliers} caption="High-risk suppliers" />
      <h4 className="panel-sub">Safer alternatives</h4>
      <Scorecards rows={e.saferAlternatives} caption="Safer alternatives" />
    </>
  );
}

function CategoryConsolidation({ e }: { e: E }) {
  return (
    <>
      <Kv
        rows={[
          ['Category', e.category],
          ['Items', `${e.productCount} items bought from ${e.vendorCount} suppliers (${e.avgVendorsPerItem} per item on average)`],
          ['Period', `Last ${e.windowDays} days`],
          ['Category spend', formatMoney(e.totalSpend)],
          ['Indicative saving', formatMoney(e.savingsAtBestMedian)],
        ]}
      />
      <div className="table-wrap">
        <table className="grid compact">
          <caption className="sr-only">Items with the largest indicative saving</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="num">Suppliers</th>
              <th scope="col">Best median supplier</th>
              <th scope="col" className="num">Saving</th>
            </tr>
          </thead>
          <tbody>
            {(e.items as E[]).map((i) => (
              <tr key={i.productId}>
                <td>
                  <ProductLink id={i.productId} name={i.productName} />
                </td>
                <td className="num tnum">{i.vendorCount}</td>
                <td>{i.bestVendorName ? `${i.bestVendorName} (${formatMoney(i.bestMedianPrice)})` : '—'}</td>
                <td className="num tnum">{formatMoney(i.saving)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Prices for these items vary a lot even within one supplier, so the saving uses each supplier&apos;s median price and is marked low confidence.</p>
    </>
  );
}

/** Renders the evidence packet for each insight type as the exact numbers behind the recommendation. */
export function EvidencePanel({ insight }: { insight: InsightDetail }) {
  const e = insight.evidence as E;
  switch (insight.type) {
    case 'COST_CREEP':
      return <CostCreep e={e} />;
    case 'SUPPLIER_VARIANCE':
      return <Variance e={e} />;
    case 'CONSOLIDATION':
      return <Consolidation e={e} />;
    case 'REORDER_ALERT':
      return <Reorder e={e} />;
    case 'MARKET_SAVINGS':
      return <Market e={e} />;
    case 'SOURCING_SHIFT':
      return <SourcingShift e={e} />;
    case 'DELIVERY_RISK':
      return <DeliveryRisk e={e} />;
    case 'MAVERICK_SPEND':
      return <Maverick e={e} />;
    case 'BUDGET_OVERRUN':
      return <Budget e={e} />;
    case 'SUPPLY_RISK':
      return <SupplyRisk e={e} />;
  }
}
