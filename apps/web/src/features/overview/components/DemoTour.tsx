import { useState } from 'react';
import { sampleUrl, useSampleManifest } from '../../../shared/lib/samples';

interface Step {
  title: string;
  body: string;
  href: string;
  cta: string;
}

const STEPS: Step[] = [
  { title: 'Read the overview', body: 'Spend, delivery reliability, off-contract (maverick) spend and budget variance for the last 12 months, straight from your purchase orders.', href: '#/overview', cta: 'You are here' },
  { title: 'Open a sourcing recommendation', body: 'A statistically tested supplier switch: price index, delivery, risk and ESG scorecards, the p-value and the annual saving. Then draft an RFQ.', href: '#/advisory?type=SOURCING_SHIFT', cta: 'Sourcing shifts' },
  { title: 'Check compliance alerts', body: 'Maverick spend and budget overruns by category, with the lines and suppliers behind each number. One is already actioned and one snoozed.', href: '#/advisory?type=MAVERICK_SPEND', cta: 'Maverick spend' },
  { title: 'Inspect a supplier', body: 'Supplier profiles from the ERP (tier, risk, ESG, payment terms), price trends, catalogue and head-to-head comparison.', href: '#/vendors', cta: 'Vendors' },
  { title: 'Inspect a product', body: 'Paid vs quoted prices over time, the supplier matrix, cheaper alternatives and a reorder plan with measured lead times.', href: '#/products', cta: 'Products' },
  { title: 'Upload the next quarter', body: 'Download your business’s Q4 2024 file, drop it into Ingestion → Purchase Orders (ERP), resolve the review queue, then re-run the analysis in Advisory.', href: '#/ingestion', cta: 'Ingestion' },
];

const KEY = 'quotescout.tour.hidden';

/** Guided demo tour: six steps through every module, with the signed-in business's sample upload. */
export function DemoTour({ email }: { email?: string }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === '1');
  const manifest = useSampleManifest();
  const mine = (manifest.data?.files ?? []).filter((f) => f.login && f.login === email);
  if (hidden) {
    return (
      <button type="button" className="btn btn-ghost tour-reopen" onClick={() => (localStorage.removeItem(KEY), setHidden(false))}>
        ✦ Show the guided tour
      </button>
    );
  }
  return (
    <section className="tour" aria-labelledby="tour-title">
      <header className="tour-head">
        <div>
          <h2 id="tour-title">✦ Guided tour</h2>
          <p>Six stops that show every capability on this business&apos;s data.</p>
        </div>
        <button type="button" className="icon-btn tour-close" aria-label="Hide the guided tour" onClick={() => (localStorage.setItem(KEY, '1'), setHidden(true))}>
          ✕
        </button>
      </header>
      <ol className="tour-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="tour-num" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <strong>{s.title}</strong>
              <p>{s.body}</p>
              <a className="link" href={s.href}>
                {s.cta} →
              </a>
              {i === STEPS.length - 1 &&
                mine.map((f) => (
                  <a key={f.file} className="dl-link dark" href={sampleUrl(f.file)} download>
                    ↓ {f.file}
                  </a>
                ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
