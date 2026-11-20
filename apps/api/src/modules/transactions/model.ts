import { InferSchemaType, Schema, model, models, type Model } from 'mongoose';
import { jsonOptions } from '../../utils/mongooseJson';

export const TRANSACTION_KINDS = ['invoice_line', 'price_quote', 'payment', 'sale'] as const;
export const SOURCE_TYPE_VALUES = ['price_sheet', 'tally', 'shopify', 'bank_statement', 'purchase_orders', 'pdf_invoice'] as const;

const transactionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    kind: { type: String, enum: TRANSACTION_KINDS, required: true },
    sourceType: { type: String, enum: SOURCE_TYPE_VALUES, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'IngestionJob', required: true },
    rawRecordId: { type: Schema.Types.ObjectId, ref: 'RawRecord', required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    reference: { type: String }, // invoice/voucher/order/bank ref
    date: { type: Date },
    description: { type: String },
    // quantity as reported and converted to the unit dimension's base unit
    quantity: { type: Number },
    unit: { type: String },
    baseQuantity: { type: Number },
    baseUnit: { type: String },
    // money as reported, and in the tenant's base currency (unchanged when already in it)
    unitPrice: { type: Number },
    amount: { type: Number },
    currency: { type: String },
    fxRate: { type: Number },
    amountBase: { type: Number },
    unitPriceBase: { type: Number }, // base-currency price per base unit
    warnings: { type: [String], default: [] },
    /** purchase-order context (present for PO exports): delivery performance, contract and compliance, budget */
    procurement: {
      type: new Schema(
        {
          poType: String,
          poStatus: String,
          requestedDelivery: Date,
          actualDelivery: Date,
          daysLate: Number,
          onTime: Boolean,
          leadTimeDays: Number,
          budgetUnitPrice: Number,
          budgetUnitPriceBase: Number,
          discountPct: Number,
          taxPct: Number,
          taxAmount: Number,
          grossAmount: Number,
          contractId: String,
          contractType: String,
          maverick: Boolean,
          singleSource: Boolean,
          preferredSupplier: Boolean,
          invoiceStatus: String,
          paymentStatus: String,
          invoiceMatch: String,
          department: String,
          costCentre: String,
          sourcing: String,
        },
        { _id: false },
      ),
      default: undefined,
    },
    fingerprint: { type: String, required: true }, // idempotency key (unique per tenant)
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['fingerprint', 'tenantId']) },
);

transactionSchema.index({ tenantId: 1, fingerprint: 1 }, { unique: true });
transactionSchema.index({ tenantId: 1, date: -1 });
transactionSchema.index({ tenantId: 1, vendorId: 1, date: -1 });
transactionSchema.index({ tenantId: 1, productId: 1 });
transactionSchema.index({ tenantId: 1, jobId: 1 });
transactionSchema.index({ tenantId: 1, reference: 1 });
transactionSchema.index({ tenantId: 1, kind: 1, sourceType: 1 });

export type TransactionAttrs = InferSchemaType<typeof transactionSchema>;
export const TransactionModel: Model<TransactionAttrs> =
  (models.Transaction as Model<TransactionAttrs>) || model<TransactionAttrs>('Transaction', transactionSchema);
