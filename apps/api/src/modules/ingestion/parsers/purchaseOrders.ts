import { parseAmount } from '../normalise/numbers';
import { pick, readTable, text } from './tabular';
import type { ParseResult, Parser } from './types';

/**
 * ERP purchase-order line exports (CSV/XLSX), e.g. SAP/Oracle/Coupa "PO lines" reports. Each line becomes a purchase
 * (`invoice_line`) and carries its delivery, contract, compliance and budget context in `procurement`, plus supplier
 * master data (tier, risk, ESG, country, payment terms) in `vendorProfile` and the item category in `productProfile`.
 * Cancelled lines are skipped (they were never bought). Header names are matched case/space-insensitively.
 */
const SYN = {
  po: ['ponumber', 'poid', 'po', 'purchaseorder', 'purchaseordernumber', 'ordernumber', 'orderno'],
  date: ['podate', 'orderdate', 'purchasedate', 'date'],
  vendor: ['suppliername', 'supplier', 'vendorname', 'vendor'],
  vendorCode: ['supplierid', 'suppliercode', 'vendorid', 'vendorcode'],
  sku: ['itemcode', 'sku', 'productcode', 'partnumber', 'materialcode'],
  product: ['itemdescription', 'itemname', 'productname', 'product', 'item', 'description', 'material'],
  category: ['category', 'itemcategory', 'productcategory'],
  subCategory: ['subcategory', 'itemsubcategory'],
  unit: ['unitofmeasure', 'uom', 'unit'],
  unitPrice: ['unitprice', 'price', 'rate'],
  qty: ['quantity', 'qty', 'orderedquantity'],
  lineNet: ['linenet', 'netamount', 'netvalue', 'linetotal', 'amount'],
  lineGross: ['linetotalgross', 'grossamount'],
  currency: ['currency', 'curr', 'currencycode'],
  discountPct: ['discountpct', 'discountpercent', 'discount'],
  taxPct: ['taxpct', 'taxpercent', 'taxrate'],
  taxAmount: ['taxamount', 'tax'],
  budgetUnitPrice: ['budgetunitprice', 'budgetprice', 'targetprice'],
  requested: ['requesteddelivery', 'requesteddeliverydate', 'needbydate', 'requireddate'],
  actual: ['actualdelivery', 'actualdeliverydate', 'deliverydate', 'receiveddate'],
  daysLate: ['dayslate', 'deliverydelaydays'],
  onTime: ['ontimedelivery', 'ontime'],
  leadTime: ['leadtimedays', 'leadtime'],
  poType: ['potype', 'ordertype'],
  poStatus: ['postatus', 'orderstatus', 'status'],
  contractId: ['contractid', 'contractnumber', 'contract'],
  contractType: ['contracttype'],
  maverick: ['maverickspend', 'maverick', 'offcontract'],
  singleSource: ['singlesourceflag', 'singlesource'],
  preferred: ['preferredsupplier', 'preferredvendor'],
  invoiceStatus: ['invoicestatus'],
  paymentStatus: ['paymentstatus'],
  invoiceMatch: ['invoicematchtype', 'matchtype'],
  department: ['department'],
  costCentre: ['costcentre', 'costcenter'],
  localInternational: ['localinternational', 'sourcingtype'],
  // supplier master data
  country: ['suppliercountry', 'vendorcountry', 'country'],
  region: ['supplierregion', 'region'],
  tier: ['suppliertier', 'tier'],
  approval: ['supplierstatus', 'vendorstatus'],
  risk: ['supplierrisk', 'riskrating', 'risk'],
  esg: ['supplieresgscore', 'esgscore', 'esg'],
  terms: ['paymentterms', 'terms'],
};

const yesNo = (v: unknown): boolean | undefined => {
  const s = text(v)?.toLowerCase();
  if (!s) return undefined;
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return undefined;
};
const num = (v: unknown): number | undefined => parseAmount(v) ?? undefined;
const termsDays = (v: unknown): number | undefined => {
  const m = text(v)?.match(/(\d{1,3})/);
  return m ? Number(m[1]) : undefined;
};
const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;

export const parsePurchaseOrders: Parser = async (buffer, { filename }) => {
  const result: ParseResult = { rows: [], errors: [], skipped: 0 };
  for (const row of await readTable(buffer, filename)) {
    const c = row.cells;
    const status = text(pick(c, SYN.poStatus));
    if (status && /^cancel/i.test(status)) {
      result.skipped++; // never bought
      continue;
    }
    const productName = text(pick(c, SYN.product));
    const sku = text(pick(c, SYN.sku));
    if (!productName && !sku) {
      result.errors.push({ rowNumber: row.rowNumber, message: 'Missing item description and item code' });
      continue;
    }
    const vendorName = text(pick(c, SYN.vendor));
    if (!vendorName) {
      result.errors.push({ rowNumber: row.rowNumber, message: 'Missing supplier name' });
      continue;
    }
    const unitPrice = pick(c, SYN.unitPrice);
    const qty = num(pick(c, SYN.qty));
    const net = num(pick(c, SYN.lineNet)) ?? (num(unitPrice) != null && qty != null ? (num(unitPrice) as number) * qty : undefined);
    if (num(unitPrice) == null && net == null) {
      result.errors.push({ rowNumber: row.rowNumber, message: 'Missing unit price and line amount' });
      continue;
    }

    result.rows.push({
      rowNumber: row.rowNumber,
      raw: row.raw,
      kind: 'invoice_line',
      vendorName,
      productName: productName ?? sku,
      sku,
      quantity: qty,
      unit: text(pick(c, SYN.unit)),
      unitPrice,
      amount: net,
      currency: text(pick(c, SYN.currency)),
      date: pick(c, SYN.date),
      reference: text(pick(c, SYN.po)),
      description: text(pick(c, SYN.subCategory)) ?? text(pick(c, SYN.category)),
      procurement: clean({
        poType: text(pick(c, SYN.poType)),
        poStatus: status,
        requestedDelivery: pick(c, SYN.requested) ?? undefined,
        actualDelivery: pick(c, SYN.actual) ?? undefined,
        daysLate: num(pick(c, SYN.daysLate)),
        onTime: yesNo(pick(c, SYN.onTime)),
        leadTimeDays: num(pick(c, SYN.leadTime)),
        budgetUnitPrice: num(pick(c, SYN.budgetUnitPrice)),
        discountPct: num(pick(c, SYN.discountPct)),
        taxPct: num(pick(c, SYN.taxPct)),
        taxAmount: num(pick(c, SYN.taxAmount)),
        grossAmount: num(pick(c, SYN.lineGross)),
        contractId: text(pick(c, SYN.contractId)),
        contractType: text(pick(c, SYN.contractType)),
        maverick: yesNo(pick(c, SYN.maverick)),
        singleSource: yesNo(pick(c, SYN.singleSource)),
        preferredSupplier: yesNo(pick(c, SYN.preferred)),
        invoiceStatus: text(pick(c, SYN.invoiceStatus)),
        paymentStatus: text(pick(c, SYN.paymentStatus)),
        invoiceMatch: text(pick(c, SYN.invoiceMatch)),
        department: text(pick(c, SYN.department)),
        costCentre: text(pick(c, SYN.costCentre)),
        sourcing: text(pick(c, SYN.localInternational)),
      }),
      vendorProfile: clean({
        supplierCode: text(pick(c, SYN.vendorCode)),
        country: text(pick(c, SYN.country)),
        region: text(pick(c, SYN.region)),
        tier: num(pick(c, SYN.tier)),
        approvalStatus: text(pick(c, SYN.approval)),
        riskRating: text(pick(c, SYN.risk)),
        esgScore: num(pick(c, SYN.esg)),
        paymentTermsDays: termsDays(pick(c, SYN.terms)),
      }),
      productProfile: clean({ category: text(pick(c, SYN.category)), subCategory: text(pick(c, SYN.subCategory)) }),
    });
  }
  return result;
};
