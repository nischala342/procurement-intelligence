import { SystemStatus } from '../features/health';
import { ItemManager } from '../features/items';

export function DashboardPage() {
  return (
    <main className="layout">
      <header>
        <h1>Procurement Intelligence</h1>
        <p className="subtitle">Full-stack integration check: API health and item management.</p>
      </header>
      <SystemStatus />
      <ItemManager />
    </main>
  );
}
