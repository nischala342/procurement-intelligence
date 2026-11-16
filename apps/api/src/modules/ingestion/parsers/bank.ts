import { extractCounterparty } from '../normalise/names';
import { parseAmount } from '../normalise/numbers';
import { pick, readTable, text } from './tabular';
import type { ParseResult, Parser } from './types';

const SYN = {
  date: ['date', 'txndate', 'transactiondate', 'valuedate', 'postingdate'],
  narration: ['description', 'narration', 'particulars', 'details', 'remarks', 'transactiondetails'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'withdrawalamt', 'debitamount', 'dr'],
  credit: ['credit', 'deposit', 'deposits', 'depositamt', 'creditamount', 'cr'],
  amount: ['amount'],
  ref: ['reference', 'ref', 'refno', 'utr', 'chequeno', 'chqno', 'transactionid', 'txnid'],
  currency: ['currency', 'curr'],
};

/** Bank statements (CSV/XLSX). Debits become `payment` rows; credits are skipped. */
export const parseBankStatement: Parser = async (buffer, { filename }) => {
  const result: ParseResult = { rows: [], errors: [], skipped: 0 };
  for (const row of await readTable(buffer, filename)) {
    const c = row.cells;
    const narration = text(pick(c, SYN.narration));
    const debit = parseAmount(pick(c, SYN.debit));
    const credit = parseAmount(pick(c, SYN.credit));
    const signed = parseAmount(pick(c, SYN.amount));

    let outflow: number | null = null;
    if (debit != null && debit !== 0) outflow = Math.abs(debit);
    else if (credit != null && credit !== 0) outflow = null;
    else if (signed != null && signed < 0) outflow = Math.abs(signed);

    if (outflow == null) {
      const inflow = (credit != null && credit !== 0) || (signed != null && signed > 0);
      if (inflow) result.skipped++;
      else result.errors.push({ rowNumber: row.rowNumber, message: 'No debit/credit amount found' });
      continue;
    }
    if (!narration) {
      result.errors.push({ rowNumber: row.rowNumber, message: 'Missing description/narration' });
      continue;
    }
    result.rows.push({
      rowNumber: row.rowNumber,
      raw: row.raw,
      kind: 'payment',
      vendorName: extractCounterparty(narration),
      amount: outflow,
      currency: text(pick(c, SYN.currency)),
      date: pick(c, SYN.date),
      reference: text(pick(c, SYN.ref)),
      description: narration,
    });
  }
  return result;
};
