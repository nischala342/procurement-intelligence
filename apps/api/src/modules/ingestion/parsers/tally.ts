import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../../utils/AppError';
import { parseAmount, splitQuantityUnit } from '../normalise/numbers';
import type { ParseResult, ParsedRow, Parser, RowKind } from './types';

type Node = Record<string, unknown>;

const VOUCHER_KINDS: Record<string, RowKind> = { purchase: 'invoice_line', payment: 'payment', sales: 'sale' };

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false, // keep numbers/dates as text; normalisers own the parsing
  trimValues: true,
  isArray: (name) => ['VOUCHER', 'ALLINVENTORYENTRIES.LIST', 'INVENTORYENTRIES.LIST', 'LEDGERENTRIES.LIST', 'ALLLEDGERENTRIES.LIST'].includes(name),
});

function collectVouchers(node: unknown, out: Node[]) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collectVouchers(n, out));
  for (const [k, v] of Object.entries(node as Node)) {
    if (k === 'VOUCHER' && Array.isArray(v)) out.push(...(v as Node[]));
    else collectVouchers(v, out);
  }
}

const s = (v: unknown): string | undefined => (v == null || typeof v === 'object' || String(v).trim() === '' ? undefined : String(v).trim());
const arr = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : []);

/** Tally XML export: Purchase -> invoice_line per stock item, Payment -> payment, Sales -> sale. Other voucher types are skipped. */
export const parseTally: Parser = async (buffer) => {
  let doc: unknown;
  try {
    doc = xml.parse(buffer.toString('utf8'));
  } catch (e) {
    throw new AppError(422, 'PARSE_FAILED', `Invalid XML: ${(e as Error).message}`);
  }
  const vouchers: Node[] = [];
  collectVouchers(doc, vouchers);
  if (!vouchers.length) throw new AppError(422, 'PARSE_FAILED', 'No <VOUCHER> elements found; is this a Tally XML export?');

  const result: ParseResult = { rows: [], errors: [], skipped: 0 };
  let n = 0;

  for (const v of vouchers) {
    const type = (s(v['@_VCHTYPE']) ?? s(v.VOUCHERTYPENAME) ?? '').toLowerCase();
    const kind = VOUCHER_KINDS[type];
    const ref = s(v.VOUCHERNUMBER);
    if (!kind) {
      result.skipped++;
      continue;
    }
    const common = {
      kind,
      vendorName: s(v.PARTYLEDGERNAME) ?? s(v.PARTYNAME),
      vendorTaxId: s(v.PARTYGSTIN),
      date: s(v.DATE),
      reference: ref,
      description: s(v.NARRATION),
    };
    const inventory = [...arr(v['ALLINVENTORYENTRIES.LIST']), ...arr(v['INVENTORYENTRIES.LIST'])];

    if (kind !== 'payment' && inventory.length) {
      for (const inv of inventory) {
        n++;
        const qty = splitQuantityUnit(inv.BILLEDQTY ?? inv.ACTUALQTY);
        const [rate, rateUnit] = String(inv.RATE ?? '').split('/');
        const row: ParsedRow = {
          ...common,
          rowNumber: n,
          raw: { voucher: ref, type, ...Object.fromEntries(Object.entries(inv).filter(([, x]) => typeof x !== 'object')) },
          productName: s(inv.STOCKITEMNAME),
          quantity: qty.quantity ?? undefined,
          unit: qty.unit ?? s(rateUnit),
          unitPrice: s(rate),
          amount: s(inv.AMOUNT) != null ? Math.abs(parseAmount(inv.AMOUNT) ?? NaN) : undefined,
        };
        if (Number.isNaN(row.amount as number)) delete row.amount;
        result.rows.push(row);
      }
      continue;
    }

    // Ledger-only voucher (payments, service purchases): the party ledger entry carries the amount.
    const ledgers = [...arr(v['ALLLEDGERENTRIES.LIST']), ...arr(v['LEDGERENTRIES.LIST'])];
    const party = ledgers.find((l) => String(l.ISPARTYLEDGER ?? '').toLowerCase() === 'yes') ?? ledgers[0];
    const amount = party ? parseAmount(party.AMOUNT) : null;
    n++;
    if (amount == null) {
      result.errors.push({ rowNumber: n, message: `Voucher ${ref ?? '(no number)'} has no stock items or ledger amount` });
      continue;
    }
    result.rows.push({ ...common, rowNumber: n, raw: { voucher: ref, type, narration: s(v.NARRATION), amount: s(party?.AMOUNT) }, amount: Math.abs(amount) });
  }
  return result;
};
