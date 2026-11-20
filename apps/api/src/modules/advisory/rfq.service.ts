import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError';
import { TenantModel } from '../auth/model';
import { ProductModel } from '../products/model';
import { TransactionModel } from '../transactions/model';
import { VendorModel } from '../vendors/model';
import { getInsight } from './advisory.service';
import { tenantCurrency } from '../auth/tenantSettings';
import { fmtDate, money } from './narrator';
import type { RfqHint } from './types';

const MAX_SUPPLIERS = 10;
const oid = (id: string) => new Types.ObjectId(id);
const qtyText = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 4 });

export interface RfqInput {
  vendorIds?: string[];
  targetQuantity?: number;
  notes?: string;
}

/**
 * Builds a structured RFQ from an insight's evidence. Fully deterministic: quantities, reference prices and the
 * suggested suppliers were computed by the signal engine. The supplier-facing `bodyText` never discloses the internal
 * reference price; that appears only in `internalNotes`.
 */
export async function buildRfqDraft(tenantId: string, insightId: string, input: RfqInput) {
  const insight = await getInsight(tenantId, insightId);
  const hint = insight.rfq as RfqHint | null | undefined;
  if (!hint?.productId) throw new AppError(400, 'RFQ_NOT_APPLICABLE', 'This insight is not tied to a single product, so an RFQ cannot be drafted from it');

  const tid = oid(tenantId);
  const currency = await tenantCurrency(tenantId);
  const [product, tenant] = await Promise.all([ProductModel.findOne({ _id: hint.productId, tenantId: tid }), TenantModel.findById(tid)]);
  if (!product) throw AppError.notFound('The product for this insight no longer exists');

  const wanted = [...new Set(input.vendorIds ?? [...hint.suggestedVendorIds, ...hint.currentVendorIds])].slice(0, MAX_SUPPLIERS);
  const vendors = wanted.length ? await VendorModel.find({ tenantId: tid, _id: { $in: wanted.map(oid) }, status: { $ne: 'merged' } }).select('name taxId') : [];
  const missing = wanted.filter((id) => !vendors.some((v) => String(v._id) === id));
  if (missing.length) throw new AppError(400, 'UNKNOWN_VENDOR', 'Some selected suppliers do not exist in this organization', { vendorIds: missing });
  if (!vendors.length) throw new AppError(400, 'NO_SUPPLIERS', 'Select at least one supplier to invite');

  const latest = await TransactionModel.aggregate<{ _id: Types.ObjectId; price: number; kind: string; date: Date | null }>([
    { $match: { tenantId: tid, productId: product._id, vendorId: { $in: vendors.map((v) => v._id) }, kind: { $in: ['invoice_line', 'price_quote'] }, unitPriceBase: { $type: 'number' } } },
    { $sort: { date: 1, _id: 1 } },
    { $group: { _id: '$vendorId', price: { $last: '$unitPriceBase' }, kind: { $last: '$kind' }, date: { $last: '$date' } } },
  ]);
  const lastBy = new Map(latest.map((l) => [String(l._id), l]));
  const suppliers = vendors.map((v) => {
    const l = lastBy.get(String(v._id));
    return {
      vendorId: String(v._id),
      name: v.name,
      taxId: v.taxId ?? null,
      relationship: hint.currentVendorIds.includes(String(v._id)) ? ('current' as const) : ('alternative' as const),
      lastKnownPrice: l ? Math.round(l.price * 10_000) / 10_000 : null,
      lastKnownPriceKind: l ? (l.kind === 'invoice_line' ? ('purchase' as const) : ('quote' as const)) : null,
      lastKnownPriceDate: l?.date ?? null,
    };
  });

  const qty = input.targetQuantity ?? hint.targetQuantity;
  const item = {
    productId: String(product._id),
    name: product.name,
    sku: product.sku ?? null,
    baseUnit: product.baseUnit,
    knownAs: product.aliases.slice(0, 5),
    targetQuantity: qty,
    quantityBasis: input.targetQuantity != null ? 'Entered by you' : hint.quantityBasis,
  };
  const company = tenant?.name ?? 'Our organization';
  const itemLine = `${product.name}${product.sku ? ` (SKU ${product.sku})` : ''}`;
  const checklist = [
    `Unit price per ${product.baseUnit} in ${currency} (state whether prices include tax)`,
    'Minimum order quantity and price breaks by volume',
    'Lead time from order to delivery',
    'Payment terms',
    'Delivery terms (Incoterms or delivery location) and freight charges',
    'Quotation validity period',
    'Product specification, grade or certification confirmation',
  ];
  const placeholders = ['<response deadline>', '<contact name and details>', '<delivery location>'];
  const bodyText = [
    `Subject: Request for Quotation: ${itemLine}`,
    '',
    'Dear Sir/Madam,',
    '',
    `${company} invites you to submit a quotation for the following item.`,
    '',
    `Item: ${itemLine}`,
    `Unit of measure: ${product.baseUnit}`,
    qty != null ? `Target quantity: ${qtyText(qty)} ${product.baseUnit}` : 'Target quantity: to be confirmed',
    '',
    'Please include in your quotation:',
    ...checklist.map((c, i) => `${i + 1}. ${c}`),
    '',
    'Please reply by <response deadline> to <contact name and details>. Delivery location: <delivery location>.',
    input.notes ? `\nAdditional notes: ${input.notes}` : '',
    '',
    'Thank you,',
    company,
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  const inr = (n: number) => money(n, currency);
  const impact = insight.impact;
  const internalNotes = [
    `Insight: ${insight.headline}`,
    impact?.amountInr != null ? `Estimated ${impact.kind === 'savings' ? 'saving' : impact.kind === 'risk' ? 'value at stake' : 'impact'}: ${inr(impact.amountInr)} (${impact.basis})` : null,
    hint.referencePrice != null ? `Internal reference price: ${inr(hint.referencePrice)} per ${product.baseUnit} (${hint.referencePriceBasis ?? 'reference'}). Do not share with suppliers.` : null,
    `Quantity basis: ${item.quantityBasis}.`,
    `Insight evaluated as of ${fmtDate(insight.asOf.toISOString().slice(0, 10))}.`,
  ].filter((l): l is string => Boolean(l));

  return {
    insightId: String(insight._id),
    generatedAt: new Date(),
    subject: `Request for Quotation: ${itemLine}`,
    items: [item],
    suppliers,
    checklist,
    internalNotes,
    referencePrice: hint.referencePrice,
    currency,
    placeholders,
    bodyText,
  };
}
