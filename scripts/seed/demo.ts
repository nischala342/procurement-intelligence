import { AppError } from '../../apps/api/src/utils/AppError';
import { runIngestion } from '../../apps/api/src/modules/ingestion/service';
import { forgetTenantSettings } from '../../apps/api/src/modules/auth/tenantSettings';
import { TenantModel, UserModel } from '../../apps/api/src/modules/auth/model';
import { hashPassword } from '../../apps/api/src/modules/auth/service';
import { BenchmarkModel, InsightModel } from '../../apps/api/src/modules/advisory/model';
import { runScan, updateInsightStatus } from '../../apps/api/src/modules/advisory/advisory.service';
import { ProductModel } from '../../apps/api/src/modules/products/model';
import { TransactionModel } from '../../apps/api/src/modules/transactions/model';
import { DEMO_BUSINESSES, isoOf, loadDataset, splitForBusiness, toCsv, type DemoBusiness } from './data/dataset';

export const DEMO_BENCHMARK_SOURCE = 'Demo benchmark (seed data, not a real market quote)';

async function ensureBusiness(b: DemoBusiness): Promise<string> {
  const existing = await UserModel.findOne({ email: b.email });
  if (existing) {
    const t = await TenantModel.findById(existing.tenantId);
    if (t && (t.baseCurrency !== b.currency || t.name !== b.organizationName)) {
      const hasData = await TransactionModel.exists({ tenantId: t._id });
      if (hasData) throw new Error(`${b.email} already holds data in ${t.baseCurrency}. Run "npm run db:reset && npm run db:seed" to rebuild the demo businesses.`);
      t.set({ baseCurrency: b.currency, country: b.country, name: b.organizationName });
      await t.save();
      existing.organizationName = b.organizationName;
      await existing.save();
    }
    forgetTenantSettings(String(existing.tenantId));
    return String(existing.tenantId);
  }
  const tenant = await TenantModel.create({ name: b.organizationName, baseCurrency: b.currency, country: b.country });
  await UserModel.create({ email: b.email, passwordHash: await hashPassword(b.password), organizationName: b.organizationName, tenantId: tenant._id });
  console.log(`  created ${b.email} (${b.country}, ${b.currency})`);
  return String(tenant._id);
}

async function ingest(tenantId: string, name: string, csv: string) {
  try {
    const job = await runIngestion({ tenantId, buffer: Buffer.from(csv, 'utf8'), originalName: name, sourceType: 'purchase_orders' });
    console.log(`  ingested ${name}: ${job.stats?.transactionsCreated} transactions, ${job.stats?.rowsSkipped} cancelled lines skipped (${job.status})`);
  } catch (e) {
    if (e instanceof AppError && e.code === 'DUPLICATE_FILE') console.log(`  skipped ${name}: already ingested`);
    else throw e;
  }
}

/**
 * Builds one demo business per country from the reference dataset, through the real ingestion pipeline, then adds a few
 * deliberate review situations to the primary (UK) business so every workflow has something to act on.
 */
export async function seedDemoBusinesses() {
  const ds = await loadDataset();
  for (const b of DEMO_BUSINESSES) {
    console.log(`${b.organizationName} (${b.country}, ${b.currency})`);
    const tenantId = await ensureBusiness(b);
    const { history } = splitForBusiness(ds, b);
    await ingest(tenantId, `${b.code}-purchase-orders-2022-2024Q3.csv`, toCsv(ds.header, history));

    if (b.primary) {
      // 1) review workflow: one real line re-sent under a near-duplicate supplier spelling -> flagged "needs review"
      const sample = history.find((r) => r['Supplier Name'] === 'Meridian Tech');
      if (sample) await ingest(tenantId, `${b.code}-supplier-name-variant.csv`, toCsv(ds.header, [{ ...sample, 'Supplier Name': 'Meridian Technology', 'PO Number': `${sample['PO Number']}-V` }]));

      // 2) market-savings workflow: a clearly labelled DEMO benchmark 15% below the recent median paid for steel sheet
      const steel = await ProductModel.findOne({ tenantId, name: 'Steel Sheet (kg)' });
      if (steel && !(await BenchmarkModel.exists({ tenantId, productId: steel._id, sourceName: DEMO_BENCHMARK_SOURCE }))) {
        const recent = history
          .filter((r) => r['Item Description'] === 'Steel Sheet (kg)' && isoOf(r['PO Date']!) >= '2024-04-01')
          .map((r) => Number(r['Unit Price']))
          .sort((a, c) => a - c);
        const med = recent.length ? recent[Math.floor(recent.length / 2)]! : null;
        if (med) {
          await BenchmarkModel.create({
            tenantId,
            productId: steel._id,
            priceBase: Math.round(med * 0.85 * 100) / 100,
            sourceName: DEMO_BENCHMARK_SOURCE,
            sourceUrl: 'https://example.com/demo-benchmark',
            observedAt: new Date('2024-09-15T00:00:00Z'),
            verified: true,
            verifiedBy: 'seed script',
            verifiedAt: new Date(),
            notes: 'Fabricated for the demo only (15% below the recent median price paid). Not real market data.',
          });
          console.log('  created a labelled DEMO market benchmark for Steel Sheet (kg)');
        }
      }
    }

    // 3) every business gets an advisory scan (analysed as of its latest data); templates only, no external calls
    const scan = await runScan(tenantId, 'seed', { minVendors: 3, llm: null }).catch((e: unknown) => {
      if (e instanceof AppError && e.code === 'SCAN_IN_PROGRESS') return null;
      throw e;
    });
    if (scan) console.log(`  advisory scan as of ${scan.asOf.toISOString().slice(0, 10)}: ${scan.signalsDetected} insights ${JSON.stringify(scan.byType)}`);

    // 4) lifecycle states on the primary business: one actioned, one snoozed (so those views are not empty)
    // (only once: re-running the seed must not keep actioning/snoozing further insights)
    if (b.primary && !(await InsightModel.exists({ tenantId, status: { $in: ['ACTIONED', 'SNOOZED'] } }))) {
      const active = await InsightModel.find({ tenantId, status: 'ACTIVE' }).sort({ severityRank: 1, fingerprint: 1 });
      const actioned = active.find((i) => i.type === 'MAVERICK_SPEND') ?? active[0];
      const snoozed = active.find((i) => i.type === 'BUDGET_OVERRUN' && i.id !== actioned?.id) ?? active.find((i) => i.id !== actioned?.id);
      if (actioned) await updateInsightStatus(tenantId, 'seed script', actioned.id, { status: 'ACTIONED', note: 'Demo: buying policy reminder sent to the team' });
      if (snoozed) await updateInsightStatus(tenantId, 'seed script', snoozed.id, { status: 'SNOOZED', snoozeDays: 30, note: 'Demo: revisit after the quarterly budget review' });
    }
  }
}
