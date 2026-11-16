export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  db: { status: 'connected' | 'disconnected'; name: string | null };
}
