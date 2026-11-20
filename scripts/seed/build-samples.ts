import fs from 'node:fs';
import path from 'node:path';
import { DEMO_BUSINESSES, HOLDOUT_FROM, loadDataset, splitForBusiness, toCsv, writeXlsx } from './data/dataset';

/**
 * Writes the downloadable sample uploads offered on the login page and in the app (apps/web/public/samples):
 *  - <country>-purchase-orders-2024-Q4.csv: the quarter held back from each demo business (upload it to see new data
 *    flow through ingestion, analytics and advisory). Rows are copied from the dataset unchanged.
 *  - uk-purchase-orders-2024-Q4.xlsx: the same UK file as Excel.
 *  - examples/: small files showing the other supported formats (Tally XML, bank statement, Shopify, price list).
 *  - manifest.json: what each file is and which demo login it belongs to.
 */
export async function buildSamples(outDir = process.env.SAMPLES_DIR ?? path.resolve(__dirname, '../../apps/web/public/samples')) {
  const ds = await loadDataset();
  fs.mkdirSync(path.join(outDir, 'examples'), { recursive: true });
  const files: Array<Record<string, unknown>> = [];
  for (const b of DEMO_BUSINESSES) {
    const { holdout } = splitForBusiness(ds, b);
    const name = `${b.code}-purchase-orders-2024-Q4.csv`;
    fs.writeFileSync(path.join(outDir, name), toCsv(ds.header, holdout));
    files.push({ file: name, title: `${b.country}: purchase orders Oct–Dec 2024`, format: 'CSV', source: 'purchase_orders', rows: holdout.length, currency: b.currency, login: b.email, description: `PO lines held back from ${b.organizationName}'s demo data. Upload as "Purchase Orders" while signed in as ${b.email}.` });
    if (b.primary) {
      const x = `${b.code}-purchase-orders-2024-Q4.xlsx`;
      await writeXlsx(path.join(outDir, x), ds.header, holdout);
      files.push({ file: x, title: `${b.country}: purchase orders Oct–Dec 2024 (Excel)`, format: 'XLSX', source: 'purchase_orders', rows: holdout.length, currency: b.currency, login: b.email, description: 'Same lines as the UK CSV, as an Excel workbook.' });
    }
  }
  const examples: Array<[string, string, string, string]> = [
    ['tally-purchases.xml', 'Tally XML export (purchase and payment vouchers)', 'tally', 'XML'],
    ['bank-statement.csv', 'Bank statement (debits become supplier payments)', 'bank_statement', 'CSV'],
    ['shopify-orders.csv', 'Shopify orders export', 'shopify', 'CSV'],
    ['price-sheet.csv', 'Supplier price list (includes one deliberately broken row)', 'price_sheet', 'CSV'],
  ];
  for (const [f, title, source, format] of examples) {
    fs.copyFileSync(path.resolve(__dirname, 'data/samples', f), path.join(outDir, 'examples', f));
    files.push({ file: `examples/${f}`, title, format, source, description: 'Small hand-made file showing another supported source format (amounts in INR).' });
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ generatedFrom: 'datasets/Dataset_Procurement.xlsx', holdoutFrom: HOLDOUT_FROM, files }, null, 2) + '\n');
  return files.length;
}

if (require.main === module) {
  buildSamples()
    .then((n) => console.log(`Wrote ${n} sample files to apps/web/public/samples`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}
