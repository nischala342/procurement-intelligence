import { DataExplorer, IngestionHub, IngestionProvider, PipelineTracker } from '../features/ingestion';

export function IngestionPage() {
  return (
    <IngestionProvider>
      <main className="layout wide">
        <header>
          <h1>Business Data Ingestion</h1>
          <p className="subtitle">Bring supplier and purchasing data from every source into one normalised ledger.</p>
        </header>
        <IngestionHub />
        <PipelineTracker />
        <DataExplorer />
      </main>
    </IngestionProvider>
  );
}
