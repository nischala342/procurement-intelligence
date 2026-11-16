import { Types } from 'mongoose';
import { ProductModel } from '../products/model';
import { VendorModel } from '../vendors/model';
import { normalizeProductName, normalizeSku, normalizeTaxId, normalizeVendorName } from './normalise/names';
import { similarity } from './normalise/similarity';

export type Outcome = 'matched' | 'created' | 'review';
export interface Resolution {
  id: Types.ObjectId;
  outcome: Outcome;
}

interface Thresholds {
  auto: number; // >= auto-attach to the existing entity as an alias
  review: number; // >= review (but < auto): create a new entity flagged needs_review
}
const VENDOR_T: Thresholds = { auto: 0.9, review: 0.75 };
const PRODUCT_T: Thresholds = { auto: 0.92, review: 0.8 };

/** In-memory index of normalised keys -> entity id, with exact and fuzzy lookup. */
class NameIndex {
  private exact = new Map<string, string>();
  private keys: Array<[string, string]> = [];
  add(id: string, key: string) {
    if (!key || this.exact.has(key)) return;
    this.exact.set(key, id);
    this.keys.push([key, id]);
  }
  get(key: string) {
    return this.exact.get(key);
  }
  best(key: string): { id: string; score: number } | null {
    if (key.length < 4) return null; // too short for fuzzy matching to be trustworthy
    let best: { id: string; score: number } | null = null;
    for (const [k, id] of this.keys) {
      const score = similarity(key, k);
      if (!best || score > best.score) best = { id, score };
    }
    return best;
  }
}

/**
 * Resolves raw vendor/product names to canonical entities, creating them when needed.
 * One instance per ingestion job: it loads existing entities once and keeps its indexes in sync.
 * Strategy: tax id / SKU -> exact normalised name or alias -> fuzzy (auto-attach / review / new).
 * Scale note: fuzzy lookup scans all keys in memory; move to a blocking index or Atlas Search for very large catalogs.
 */
export class EntityResolver {
  private vNames = new NameIndex();
  private vTax = new Map<string, string>();
  private vMergedInto = new Map<string, string>();
  private vAliases = new Map<string, Set<string>>();
  private vDisplay = new Map<string, string>(); // vendor id -> display name
  private pNames = new NameIndex();
  private pSku = new Map<string, string>();
  private pAliases = new Map<string, Set<string>>();
  private pHasSku = new Set<string>();
  private pMergedInto = new Map<string, string>();
  private memo = new Map<string, Resolution>();
  private readonly tid: Types.ObjectId;

  /** All lookups and writes are confined to one tenant: another tenant's vendors/products are never visible here. */
  constructor(tenantId: string) {
    this.tid = new Types.ObjectId(tenantId);
  }

  async init(): Promise<void> {
    const vendors = await VendorModel.find({ tenantId: this.tid }, 'name normalizedName aliasKeys taxId status mergedInto').lean();
    for (const v of vendors) {
      const id = String(v._id);
      this.vDisplay.set(id, v.name);
      if (v.status === 'merged' && v.mergedInto) this.vMergedInto.set(id, String(v.mergedInto));
      this.vNames.add(id, v.normalizedName);
      for (const k of v.aliasKeys ?? []) this.vNames.add(id, k);
      this.vAliases.set(id, new Set([v.normalizedName, ...(v.aliasKeys ?? [])]));
      if (v.taxId) this.vTax.set(v.taxId, id);
    }
    const products = await ProductModel.find({ tenantId: this.tid }, 'normalizedName aliasKeys sku status mergedInto').lean();
    for (const p of products) {
      const id = String(p._id);
      if (p.status === 'merged' && p.mergedInto) this.pMergedInto.set(id, String(p.mergedInto));
      this.pNames.add(id, p.normalizedName);
      for (const k of p.aliasKeys ?? []) this.pNames.add(id, k);
      this.pAliases.set(id, new Set([p.normalizedName, ...(p.aliasKeys ?? [])]));
      if (p.sku) {
        this.pSku.set(p.sku, id);
        this.pHasSku.add(id);
      }
    }
  }

  private followProductMerge(id: string): string {
    let cur = id;
    for (let i = 0; i < 10 && this.pMergedInto.has(cur); i++) cur = this.pMergedInto.get(cur)!;
    return cur;
  }

  private followMerge(id: string): string {
    let cur = id;
    for (let i = 0; i < 10 && this.vMergedInto.has(cur); i++) cur = this.vMergedInto.get(cur)!;
    return cur;
  }

  async resolveVendor(rawName: string, rawTaxId?: string): Promise<Resolution | null> {
    const key = normalizeVendorName(rawName);
    if (!key) return null;
    const taxId = rawTaxId ? normalizeTaxId(rawTaxId) : undefined;
    const memoKey = `v|${taxId ?? ''}|${rawName.trim()}`; // per raw spelling, so each variant is recorded as an alias once
    const cached = this.memo.get(memoKey);
    if (cached) return { id: cached.id, outcome: 'matched' };

    const finish = (r: Resolution) => {
      this.memo.set(memoKey, r);
      return r;
    };
    const attach = async (id: string): Promise<Resolution> => {
      const real = this.followMerge(id);
      const known = this.vAliases.get(real) ?? new Set<string>();
      const update: Record<string, unknown> = {};
      const spelling = rawName.trim();
      if (spelling !== this.vDisplay.get(real)) {
        // idempotent: records each distinct raw spelling ("ACME Private Limited") and its normalised key
        update.$addToSet = { aliases: spelling, aliasKeys: key };
        known.add(key);
        this.vAliases.set(real, known);
        this.vNames.add(real, key);
      }
      if (taxId && !this.vTax.has(taxId)) {
        update.$set = { taxId };
        this.vTax.set(taxId, real);
      }
      if (Object.keys(update).length) await VendorModel.updateOne({ _id: real, tenantId: this.tid }, update);
      return { id: new Types.ObjectId(real), outcome: 'matched' };
    };

    if (taxId && this.vTax.has(taxId)) return finish(await attach(this.vTax.get(taxId)!));
    const exact = this.vNames.get(key);
    if (exact) return finish(await attach(exact));

    const best = this.vNames.best(key);
    if (best && best.score >= VENDOR_T.auto) return finish(await attach(best.id));

    const review = best && best.score >= VENDOR_T.review ? best : null;
    const doc = await VendorModel.create({
      tenantId: this.tid,
      name: rawName.trim(),
      normalizedName: key,
      aliases: [],
      aliasKeys: [],
      ...(taxId ? { taxId } : {}),
      status: review ? 'needs_review' : 'active',
      ...(review ? { possibleDuplicateOf: this.followMerge(review.id), similarityScore: Number(review.score.toFixed(3)) } : {}),
    });
    const id = String(doc._id);
    this.vDisplay.set(id, doc.name);
    this.vNames.add(id, key);
    this.vAliases.set(id, new Set([key]));
    if (taxId) this.vTax.set(taxId, id);
    return finish({ id: doc._id, outcome: review ? 'review' : 'created' });
  }

  async resolveProduct(input: { name?: string; sku?: string; baseUnit: string; dimension: string }): Promise<Resolution | null> {
    const sku = input.sku ? normalizeSku(input.sku) : undefined;
    const key = normalizeProductName(input.name ?? sku ?? '');
    if (!key) return null;
    const memoKey = `p|${sku ?? ''}|${key}`;
    const cached = this.memo.get(memoKey);
    if (cached) return { id: cached.id, outcome: 'matched' };
    const finish = (r: Resolution) => {
      this.memo.set(memoKey, r);
      return r;
    };

    const attach = async (rawId: string): Promise<Resolution> => {
      const id = this.followProductMerge(rawId);
      const known = this.pAliases.get(id) ?? new Set<string>();
      const update: Record<string, unknown> = {};
      if (!known.has(key)) {
        update.$addToSet = { aliases: (input.name ?? key).trim(), aliasKeys: key };
        known.add(key);
        this.pAliases.set(id, known);
        this.pNames.add(id, key);
      }
      if (sku && !this.pHasSku.has(id) && !this.pSku.has(sku)) {
        update.$set = { sku };
        this.pSku.set(sku, id);
        this.pHasSku.add(id);
      }
      if (Object.keys(update).length) await ProductModel.updateOne({ _id: id, tenantId: this.tid }, update);
      return { id: new Types.ObjectId(id), outcome: 'matched' };
    };

    if (sku && this.pSku.has(sku)) return finish(await attach(this.pSku.get(sku)!));
    const exact = this.pNames.get(key);
    if (exact) return finish(await attach(exact));
    const best = this.pNames.best(key);
    if (best && best.score >= PRODUCT_T.auto) return finish(await attach(best.id));

    const review = best && best.score >= PRODUCT_T.review ? best : null;
    const doc = await ProductModel.create({
      tenantId: this.tid,
      name: (input.name ?? sku ?? key).trim(),
      normalizedName: key,
      ...(sku ? { sku } : {}),
      baseUnit: input.baseUnit,
      dimension: input.dimension,
      status: review ? 'needs_review' : 'active',
      ...(review ? { possibleDuplicateOf: this.followProductMerge(review.id), similarityScore: Number(review.score.toFixed(3)) } : {}),
    });
    const id = String(doc._id);
    this.pNames.add(id, key);
    this.pAliases.set(id, new Set([key]));
    if (sku) {
      this.pSku.set(sku, id);
      this.pHasSku.add(id);
    }
    return finish({ id: doc._id, outcome: review ? 'review' : 'created' });
  }
}
