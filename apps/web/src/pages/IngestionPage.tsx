import { useAuth } from '../features/auth';
import { DataExplorer, IngestionHub, IngestionProvider, PipelineTracker } from '../features/ingestion';

export function IngestionPage() {
  const { user } = useAuth();
  return (
    <IngestionProvider>
      <main className="layout wide">
        <header className="page-head">
          <p className="eyebrow">Data</p>
          <h1>Business Data Ingestion</h1>
          <p className="subtitle">Bring supplier and purchasing data from every source into one normalised ledger.</p>
        </header>
        <IngestionHub userEmail={user?.email} />
        <PipelineTracker />
        <DataExplorer />
      </main>
    </IngestionProvider>
  );
}
