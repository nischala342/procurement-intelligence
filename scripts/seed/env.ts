import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const MONGO_URI =
  process.env.MONGO_URI ?? 'mongodb://localhost:27017/procurement_intelligence?directConnection=true';

/** Destructive actions are blocked in production unless explicitly allowed. */
export function assertDestructiveAllowed(action: string): void {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    console.error(`Refusing to ${action}: NODE_ENV=production. Set ALLOW_DESTRUCTIVE_SEED=true to override.`);
    process.exit(1);
  }
}
