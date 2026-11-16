import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { AppError } from '../../apps/api/src/utils/AppError';
import { runIngestion } from '../../apps/api/src/modules/ingestion/service';
import type { SourceType } from '../../apps/api/src/modules/ingestion/parsers/types';
import { IngestionJobModel, RawRecordModel } from '../../apps/api/src/modules/ingestion/model';
import { ProductModel } from '../../apps/api/src/modules/products/model';
import { TransactionModel } from '../../apps/api/src/modules/transactions/model';
import { VendorModel } from '../../apps/api/src/modules/vendors/model';
import { TenantModel, UserModel } from '../../apps/api/src/modules/auth/model';
import { hashPassword } from '../../apps/api/src/modules/auth/service';
import { ItemModel } from '../../apps/api/src/modules/items/model';
import { allItems } from './data/items';
import { MONGO_URI, assertDestructiveAllowed } from './env';

/** Development-only demo account. The sample files are ingested into this tenant. */
export const DEMO_USER = { email: 'demo@procurement.test', password: 'Demo@12345', organizationName: 'Demo Procurement Co' };

async function ensureDemoTenant(): Promise<string> {
  const existing = await UserModel.findOne({ email: DEMO_USER.email });
  if (existing) return String(existing.tenantId);
  const tenant = await TenantModel.create({ name: DEMO_USER.organizationName });
  await UserModel.create({
    email: DEMO_USER.email,
    passwordHash: await hashPassword(DEMO_USER.password),
    organizationName: DEMO_USER.organizationName,
    tenantId: tenant._id,
  });
  console.log(`Created demo account ${DEMO_USER.email} / ${DEMO_USER.password}`);
  return String(tenant._id);
}

/**
 * Idempotent seeder. Upserts by slug (fixed _id set only on insert), so re-running never duplicates.
 * Usage: npm run db:seed            -> upsert fixtures + generated data
 *        npm run seed:clean -w @pi/seed  -> wipe items first, then seed
 */
async function main() {
  const clean = process.argv.includes('--clean');
  if (clean) assertDestructiveAllowed('clean items before seeding');

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  console.log(`Connected to ${mongoose.connection.name}`);

  if (clean) {
    const { deletedCount } = await ItemModel.deleteMany({});
    console.log(`Cleaned items collection (${deletedCount} removed)`);
    await Promise.all([
      TransactionModel.deleteMany({}),
      RawRecordModel.deleteMany({}),
      IngestionJobModel.deleteMany({}),
      VendorModel.deleteMany({}),
      ProductModel.deleteMany({}),
      UserModel.deleteMany({}),
      TenantModel.deleteMany({}),
    ]);
    console.log('Cleaned ingestion collections and accounts (transactions, raw records, jobs, vendors, products, users, tenants)');
  }

  const items = allItems();
  const result = await ItemModel.bulkWrite(
    items.map(({ _id, ...fields }) => ({
      updateOne: {
        filter: { slug: fields.slug },
        update: { $set: fields, $setOnInsert: { _id: new mongoose.Types.ObjectId(_id) } },
        upsert: true,
      },
    })),
  );
  await Promise.all([
    ItemModel.syncIndexes(),
    VendorModel.syncIndexes(),
    ProductModel.syncIndexes(),
    TransactionModel.syncIndexes(),
    IngestionJobModel.syncIndexes(),
    RawRecordModel.syncIndexes(),
    UserModel.syncIndexes(),
    TenantModel.syncIndexes(),
  ]);

  if (process.env.NODE_ENV === 'production') {
    console.log('NODE_ENV=production: skipping demo account and sample ingestion.');
    return;
  }
  const tenantId = await ensureDemoTenant();

  // Ingest the sample source files through the real pipeline into the demo tenant (idempotent: same file hash => skipped).
  const samples: Array<[string, SourceType]> = [
    ['price-sheet.csv', 'price_sheet'],
    ['tally-purchases.xml', 'tally'],
    ['shopify-orders.csv', 'shopify'],
    ['shopify-products.json', 'shopify'],
    ['bank-statement.csv', 'bank_statement'],
  ];
  for (const [file, sourceType] of samples) {
    try {
      const job = await runIngestion({
        tenantId,
        buffer: fs.readFileSync(path.resolve(__dirname, 'data/samples', file)),
        originalName: file,
        sourceType,
      });
      console.log(`Ingested ${file}: ${job.stats?.transactionsCreated} transactions (${job.status})`);
    } catch (e) {
      if (e instanceof AppError && e.code === 'DUPLICATE_FILE') console.log(`Skipped ${file}: already ingested`);
      else throw e;
    }
  }
  console.log(`Seed complete: ${result.upsertedCount} inserted, ${result.modifiedCount} updated, ${items.length} total managed.`);
  console.log('Known fixtures: fixture-laptop, fixture-software-license, fixture-legacy-printer (ids ...0001-0003)');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
