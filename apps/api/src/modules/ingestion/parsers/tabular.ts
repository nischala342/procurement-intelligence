import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AppError } from '../../../utils/AppError';

export interface TableRow {
  /** 1-based line number in the source (header = 1). */
  rowNumber: number;
  /** Cells keyed by normalised header (lowercase alphanumerics only). */
  cells: Record<string, unknown>;
  /** Cells keyed by original header, stored as the raw payload. */
  raw: Record<string, unknown>;
}

export const normalizeHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');

function excelValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return excelValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
    return String(v);
  }
  return v;
}

/** Reads the first sheet of an .xlsx or a .csv into header-keyed rows. */
export async function readTable(buffer: Buffer, filename: string): Promise<TableRow[]> {
  const ext = path.extname(filename).toLowerCase();
  let matrix: unknown[][];

  if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new AppError(422, 'PARSE_FAILED', 'File is not a valid .xlsx workbook');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new AppError(422, 'PARSE_FAILED', 'Workbook has no worksheets');
    matrix = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(excelValue);
      // Preserve original sheet row numbers in position 0 by using a tagged tuple
      matrix.push([row.number, ...values]);
    });
  } else {
    try {
      const records = parseCsv(buffer, { bom: true, skip_empty_lines: true, relax_column_count: true, trim: true }) as string[][];
      matrix = records.map((r, i) => [i + 1, ...r]);
    } catch (e) {
      throw new AppError(422, 'PARSE_FAILED', `Invalid CSV: ${(e as Error).message}`);
    }
  }

  const headerRow = matrix.find((r) => r.slice(1).some((c) => !isBlank(c)));
  if (!headerRow) return [];
  const headerLine = headerRow[0] as number;
  const headers = headerRow.slice(1).map((h) => String(h ?? '').trim());

  const rows: TableRow[] = [];
  for (const r of matrix) {
    const line = r[0] as number;
    if (line <= headerLine) continue;
    const values = r.slice(1);
    if (values.every(isBlank)) continue;
    const cells: Record<string, unknown> = {};
    const raw: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const v = isBlank(values[i]) ? null : values[i];
      cells[normalizeHeader(h)] = v;
      raw[h] = v instanceof Date ? v.toISOString() : v;
    });
    rows.push({ rowNumber: line, cells, raw });
  }
  return rows;
}

/** First non-blank cell among header synonyms (already normalised). */
export function pick(cells: Record<string, unknown>, synonyms: string[]): unknown {
  for (const s of synonyms) {
    const v = cells[s];
    if (!isBlank(v)) return v;
  }
  return undefined;
}

export const text = (v: unknown): string | undefined => (isBlank(v) ? undefined : String(v).trim());
