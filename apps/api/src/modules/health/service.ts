import mongoose from 'mongoose';
import { pingDb } from '../../config/db';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  db: { status: 'connected' | 'disconnected'; name: string | null };
}

export async function getHealth(): Promise<HealthReport> {
  const dbUp = await pingDb();
  return {
    status: dbUp ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    db: { status: dbUp ? 'connected' : 'disconnected', name: dbUp ? mongoose.connection.name : null },
  };
}
