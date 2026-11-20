import mongoose from 'mongoose';
import { IngestionJobModel, RawRecordModel } from '../../apps/api/src/modules/ingestion/model';
import { ProductModel } from '../../apps/api/src/modules/products/model';
import { TransactionModel } from '../../apps/api/src/modules/transactions/model';
import { VendorModel } from '../../apps/api/src/modules/vendors/model';
import { TenantModel, UserModel } from '../../apps/api/src/modules/auth/model';
import { AdvisoryRunModel, BenchmarkModel, InsightModel } from '../../apps/api/src/modules/advisory/model';
import { ItemModel } from '../../apps/api/src/modules/items/model';
import { buildSamples } from './build-samples';
import { DEMO_BUSINESSES } from './data/dataset';
import { allItems } from './data/items';
import { seedDemoBusinesses } from './demo';
import { MONGO_URI, assertDestructiveAllowed } from './env';

/**
 * Idempotent seeder.
 *  - reference `items` fixtures (upserted by slug)
 *  - five demo businesses (UK/GBP, Germany/EUR, US/USD, Japan/JPY, Australia/AUD) built from
 *    datasets/Dataset_Procurement.xlsx through the real ingestion pipeline (amounts unchanged), with advisory scans
 *  - downloadable sample uploads in apps/web/public/samples (the held-back Q4 2024 quarter + format examples)
 * Usage: npm run db:seed | npm run seed:clean -w @pi/seed (wipe first). Re-running never duplicates (file hashes).
 */
async function main() {
  const clean = process.argv.includes('--clean');
  if (clean) assertDestructiveAllowed('clean items before seeding');

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  console.log(`Connected to ${mongoose.connection.name}`);

  if (clean) {
    await Promise.all(
      [ItemModel, TransactionModel, RawRecordModel, IngestionJobModel, VendorModel, ProductModel, InsightModel, AdvisoryRunModel, BenchmarkModel, UserModel, TenantModel].map((m) =>
        (m as unknown as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({}),
      ),
    );
    console.log('Cleaned all collections');
  }

  const items = allItems();
  const result = await ItemModel.bulkWrite(
    items.map(({ _id, ...fields }) => ({
      updateOne: { filter: { slug: fields.slug }, update: { $set: fields, $setOnInsert: { _id: new mongoose.Types.ObjectId(_id) } }, upsert: true },
    })),
  );
  await Promise.all(
    [ItemModel, VendorModel, ProductModel, TransactionModel, IngestionJobModel, RawRecordModel, UserModel, TenantModel, InsightModel, AdvisoryRunModel, BenchmarkModel].map((m) =>
      (m as unknown as { syncIndexes: () => Promise<unknown> }).syncIndexes(),
    ),
  );

  if (process.env.NODE_ENV === 'production') {
    console.log('NODE_ENV=production: skipping demo businesses.');
    return;
  }
  await seedDemoBusinesses();
  const n = await buildSamples();
  console.log(`Wrote ${n} downloadable sample files to ${process.env.SAMPLES_DIR ?? "apps/web/public/samples"}`);
  console.log(`Seed complete: ${result.upsertedCount} items inserted. Demo logins (password ${DEMO_BUSINESSES[0]!.password}):`);
  for (const b of DEMO_BUSINESSES) console.log(`  ${b.email.padEnd(28)} ${b.organizationName} (${b.country}, ${b.currency})`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
