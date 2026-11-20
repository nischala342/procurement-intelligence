import mongoose, { type Model } from 'mongoose';
import { TenantModel, UserModel } from '../modules/auth/model';
import { IngestionJobModel, RawRecordModel } from '../modules/ingestion/model';
import { AdvisoryRunModel, BenchmarkModel, InsightModel } from '../modules/advisory/model';
import { ProductModel } from '../modules/products/model';
import { TransactionModel } from '../modules/transactions/model';
import { VendorModel } from '../modules/vendors/model';
import { env } from './env';
import { logger } from './logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const syncIndexes = (m: Model<any>) => m.syncIndexes();

mongoose.set('strictQuery', true);

export async function connectDb(): Promise<typeof mongoose> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  const conn = await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  if (!env.isProd) {
    // Dev/test: make indexes match the schemas, dropping stale ones. This matters after the tenant migration,
    // which replaced global unique indexes (e.g. vendor normalizedName) with per-tenant compound ones.
    await Promise.all([VendorModel, ProductModel, TransactionModel, IngestionJobModel, RawRecordModel, UserModel, TenantModel, InsightModel, AdvisoryRunModel, BenchmarkModel].map(syncIndexes));
  }
  return conn;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/** Round-trips a ping to MongoDB. Resolves false on any failure. */
export async function pingDb(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
