import path from 'node:path';
import ExcelJS from 'exceljs';

/**
 * The reference procurement dataset (datasets/Dataset_Procurement.xlsx, sheet "Data": 5,200 PO lines, 2022–2024).
 *
 * Its currency labels are nominal: every supplier and item appears in all five currencies on the same numeric scale,
 * so converting between them would invent price differences. Instead each currency becomes its own demo business in
 * the matching country, and every amount is kept exactly as written in the file (the tenant's base currency = the
 * file's currency, rate 1).
 */
export const DATASET_PATH = path.resolve(__dirname, '../../../datasets/Dataset_Procurement.xlsx');

/** PO lines on/after this date are held back from seeding and offered as downloadable sample uploads. */
export const HOLDOUT_FROM = '2024-10-01';

export interface DemoBusiness {
  code: string; // file prefix
  currency: string;
  country: string;
  organizationName: string;
  email: string;
  password: string;
  primary?: boolean;
}

export const DEMO_PASSWORD = 'Demo@12345';

export const DEMO_BUSINESSES: DemoBusiness[] = [
  { code: 'uk', currency: 'GBP', country: 'United Kingdom', organizationName: 'Thames Valley Manufacturing Ltd', email: 'demo@procurement.test', password: DEMO_PASSWORD, primary: true },
  { code: 'de', currency: 'EUR', country: 'Germany', organizationName: 'Rheinwerk Fertigung GmbH', email: 'demo.de@procurement.test', password: DEMO_PASSWORD },
  { code: 'us', currency: 'USD', country: 'United States', organizationName: 'Lakeshore Industrial Inc.', email: 'demo.us@procurement.test', password: DEMO_PASSWORD },
  { code: 'jp', currency: 'JPY', country: 'Japan', organizationName: 'Sakura Precision K.K.', email: 'demo.jp@procurement.test', password: DEMO_PASSWORD },
  { code: 'au', currency: 'AUD', country: 'Australia', organizationName: 'Southern Cross Fabrication Pty Ltd', email: 'demo.au@procurement.test', password: DEMO_PASSWORD },
];

export interface Dataset {
  header: string[];
  rows: Array<Record<string, string | number>>;
}

const cell = (v: ExcelJS.CellValue): string | number => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown };
    return (o.result ?? o.text ?? '') as string | number;
  }
  return v as string | number;
};

export async function loadDataset(file = DATASET_PATH): Promise<Dataset> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Data') ?? wb.worksheets[0];
  if (!ws) throw new Error(`No worksheet in ${file}`);
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => String(cell(h)));
  const rows: Dataset['rows'] = [];
  ws.eachRow((r, i) => {
    if (i === 1) return;
    const vals = (r.values as ExcelJS.CellValue[]).slice(1);
    rows.push(Object.fromEntries(header.map((h, j) => [h, cell(vals[j] ?? null)])));
  });
  return { header, rows };
}

/** "dd/mm/yyyy" -> "yyyy-mm-dd" for comparisons (the file's own strings are written back unchanged). */
export const isoOf = (ddmmyyyy: string | number) => {
  const [d, m, y] = String(ddmmyyyy).split('/');
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const esc = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: string[], rows: Dataset['rows']): string {
  return [header.map(esc).join(','), ...rows.map((r) => header.map((h) => esc(r[h] ?? '')).join(','))].join('\n') + '\n';
}

export function splitForBusiness(ds: Dataset, b: DemoBusiness) {
  const mine = ds.rows.filter((r) => r.Currency === b.currency);
  return {
    history: mine.filter((r) => isoOf(r['PO Date']!) < HOLDOUT_FROM),
    holdout: mine.filter((r) => isoOf(r['PO Date']!) >= HOLDOUT_FROM),
  };
}

export async function writeXlsx(file: string, header: string[], rows: Dataset['rows']) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(header);
  for (const r of rows) ws.addRow(header.map((h) => r[h] ?? ''));
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(file);
}
