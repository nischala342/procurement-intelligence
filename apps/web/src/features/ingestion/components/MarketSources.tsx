import { Pill } from '../../../shared/ui/Pill';

/**
 * Planned open / public price references. Display only: none of these has an importer yet, so nothing can be uploaded
 * and no prices are shown. When built, imported prices will land as *unverified* benchmarks that a buyer must verify
 * (source link required) before they can drive a Market savings recommendation.
 */
interface Pointer {
  key: string;
  title: string;
  kind: string;
  plan: string;
  url: string;
}

export const MARKET_POINTERS: Pointer[] = [
  { key: 'ondc', title: 'ONDC', kind: 'Open commerce network', plan: 'Pull catalogue prices of items you buy from sellers on the Open Network for Digital Commerce.', url: 'https://ondc.org' },
  { key: 'indiamart', title: 'IndiaMART', kind: 'B2B marketplace', plan: 'Import supplier listing and quote price points as reference prices for the same items.', url: 'https://www.indiamart.com' },
  { key: 'gem', title: 'GeM', kind: 'Government e-Marketplace', plan: 'Use published public-procurement prices as a benchmark for comparable items.', url: 'https://gem.gov.in' },
  { key: 'agmarknet', title: 'Agmarknet', kind: 'Commodity prices (open data)', plan: 'Daily wholesale market prices for agricultural inputs, from government open data.', url: 'https://agmarknet.gov.in' },
];

export function MarketSources() {
  return (
    <section className="market-pointers" aria-labelledby="market-title">
      <h3 id="market-title">Market price pointers</h3>
      <p className="muted small">
        Open and public price references to compare what you pay against. These importers are <strong>not built yet</strong>; nothing is fetched or shown from them today. Once available, imported prices will need your verification (with a source link) before they can drive a market-savings recommendation. Today a verified benchmark can only be recorded through the API (POST /advisory/benchmarks).
      </p>
      <ul className="pointer-grid">
        {MARKET_POINTERS.map((p) => (
          <li key={p.key} className="pointer-card" aria-disabled="true">
            <div className="pointer-head">
              <strong>{p.title}</strong>
              <Pill tone="neutral" glyph="⏳">
                To do
              </Pill>
            </div>
            <span className="muted small">{p.kind}</span>
            <span className="small">{p.plan}</span>
            <a className="link small" href={p.url} target="_blank" rel="noopener noreferrer">
              {p.url.replace(/^https?:\/\/(www\.)?/, '')} ↗
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
