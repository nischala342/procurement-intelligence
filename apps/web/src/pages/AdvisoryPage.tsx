import { AdvisoryCommandCenter } from '../features/advisory';
import { clearHashQuery, useHashParam } from '../shared/hooks/useHashRoute';
import '../features/advisory/advisory.css';

export function AdvisoryPage() {
  const type = useHashParam('type');
  return (
    <main className="layout wide">
      <header className="page-head">
        <p className="eyebrow">Recommendations</p>
        <h1>Advisory</h1>
        <p className="subtitle">Plain-language, evidence-backed recommendations and risk alerts. Every number traces back to your own purchase lines.</p>
      </header>
      <AdvisoryCommandCenter typeParam={type} onTypeConsumed={clearHashQuery} />
    </main>
  );
}
