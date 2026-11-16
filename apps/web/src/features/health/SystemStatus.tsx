import { Card } from '../../shared/ui/Card';
import { useHealth } from './useHealth';

export function SystemStatus() {
  const { health, error, loading, refresh } = useHealth();
  const ok = health?.status === 'ok';

  return (
    <Card
      title="System Status"
      action={
        <button className="secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      }
    >
      <span className={`badge ${ok ? 'ok' : 'bad'}`}>{ok ? 'API & DB healthy' : 'Unavailable'}</span>
      {error && <p className="error">{error}</p>}
      {health && (
        <dl className="kv">
          <dt>Database</dt>
          <dd>
            {health.db.status} {health.db.name && `(${health.db.name})`}
          </dd>
          <dt>Uptime</dt>
          <dd>{health.uptimeSeconds}s</dd>
          <dt>Version</dt>
          <dd>{health.version}</dd>
          <dt>Server time</dt>
          <dd>{new Date(health.timestamp).toLocaleString()}</dd>
        </dl>
      )}
    </Card>
  );
}
